import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { CryptoService } from '../crypto.service';
import { AuthService } from '../auth.service';

type FacebookPage = { id: string; name: string; access_token?: string; tasks?: string[]; category?: string };

@Injectable()
export class FacebookService {
  private readonly scopes = 'pages_show_list,pages_read_engagement,pages_manage_posts';
  private readonly defaultGraphVersion = 'v26.0';
  constructor(private db: PrismaService, private cryptoService: CryptoService, private config: ConfigService, private auth: AuthService) {}
  private clientId(){ return this.config.get<string>('FACEBOOK_CLIENT_ID') || this.config.get<string>('META_CLIENT_ID') || ''; }
  private clientSecret(){ return this.config.get<string>('FACEBOOK_CLIENT_SECRET') || this.config.get<string>('META_CLIENT_SECRET') || ''; }
  private graphVersion(){ return this.config.get<string>('META_GRAPH_VERSION') || this.defaultGraphVersion; }
  private redirectUri(){ return this.config.get<string>('FACEBOOK_REDIRECT_URI') || `${this.config.get<string>('APP_URL')}/api/v1/marketplace/facebook/callback`; }
  isConfigured(){ return !!this.clientId() && !!this.clientSecret() && !!this.config.get<string>('APP_URL'); }
  private graphBase(){ return `https://graph.facebook.com/${this.graphVersion()}`; }
  private appSecretProof(token:string){ const secret=this.clientSecret(); return secret ? crypto.createHmac('sha256',secret).update(token).digest('hex') : ''; }

  private async graph(path:string, token:string, init:RequestInit={}) {
    const url=new URL(`${this.graphBase()}${path}`);
    url.searchParams.set('access_token',token);
    const proof=this.appSecretProof(token); if(proof) url.searchParams.set('appsecret_proof',proof);
    const response=await fetch(url,{...init,headers:{...(init.headers||{}),'Content-Type':'application/json'}});
    if(!response.ok) throw new Error(`FACEBOOK_API_${response.status}:${await response.text()}`);
    return response.json();
  }

  async connectUrl(userId:string){
    if(!this.isConfigured()) throw new Error('FACEBOOK_APP_NOT_CONFIGURED');
    const state=crypto.randomBytes(24).toString('hex');
    await this.db.oAuthState.create({data:{state,codeVerifier:crypto.randomBytes(32).toString('base64url'),userId,expiresAt:new Date(Date.now()+10*60*1000)}});
    const url=new URL(`https://www.facebook.com/${this.graphVersion()}/dialog/oauth`);
    url.searchParams.set('client_id',this.clientId()); url.searchParams.set('redirect_uri',this.redirectUri());
    url.searchParams.set('response_type','code'); url.searchParams.set('scope',this.scopes); url.searchParams.set('state',state);
    return {url:url.toString()};
  }

  async callback(code:string,state:string){
    if(!code||!state) throw new UnauthorizedException('FACEBOOK_OAUTH_CODE_MISSING');
    const oauth=await this.db.oAuthState.findUnique({where:{state}});
    if(!oauth||oauth.expiresAt<new Date()) throw new UnauthorizedException('INVALID_OAUTH_STATE');
    await this.db.oAuthState.delete({where:{id:oauth.id}});
    const tokenUrl=new URL(`${this.graphBase()}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id',this.clientId()); tokenUrl.searchParams.set('client_secret',this.clientSecret());
    tokenUrl.searchParams.set('redirect_uri',this.redirectUri()); tokenUrl.searchParams.set('code',code);
    const response=await fetch(tokenUrl);
    if(!response.ok) throw new Error(`FACEBOOK_TOKEN_EXCHANGE_FAILED:${response.status}`);
    const tokenData:any=await response.json(); if(!tokenData.access_token) throw new Error('FACEBOOK_NO_ACCESS_TOKEN');
    const userToken=tokenData.access_token as string; const pages=await this.fetchPages(userToken);
    const metadata={pages:pages.map(p=>({id:p.id,name:p.name,category:p.category,tasks:p.tasks})),selectedPageId:pages.length===1?pages[0].id:null,selectedPageName:pages.length===1?pages[0].name:null};
    await this.db.channelConnection.upsert({
      where:{userId_channel:{userId:oauth.userId,channel:'FACEBOOK'}},
      create:{userId:oauth.userId,channel:'FACEBOOK',status:'CONNECTED',accessTokenEnc:this.cryptoService.encrypt(userToken),scopes:this.scopes,externalUserId:pages.length===1?pages[0].id:null,metadata:JSON.stringify(metadata)},
      update:{status:'CONNECTED',accessTokenEnc:this.cryptoService.encrypt(userToken),scopes:this.scopes,externalUserId:pages.length===1?pages[0].id:null,metadata:JSON.stringify(metadata)}
    });
    return {ok:true,pages:pages.map(p=>({id:p.id,name:p.name}))};
  }

  private async connection(userId:string){
    const c=await this.db.channelConnection.findUnique({where:{userId_channel:{userId,channel:'FACEBOOK'}}});
    if(!c?.accessTokenEnc) throw new UnauthorizedException('FACEBOOK_NOT_CONNECTED'); return c;
  }
  private parseMetadata(metadata?:string|null){ if(!metadata)return{}; try{return JSON.parse(metadata)}catch{return{}}; }

  private async fetchPages(userToken:string):Promise<FacebookPage[]>{
    const url=new URL(`${this.graphBase()}/me/accounts`);
    url.searchParams.set('fields','id,name,access_token,tasks,category'); url.searchParams.set('access_token',userToken);
    const proof=this.appSecretProof(userToken); if(proof)url.searchParams.set('appsecret_proof',proof);
    const response=await fetch(url); if(!response.ok)throw new Error(`FACEBOOK_PAGES_${response.status}:${await response.text()}`);
    const data:any=await response.json(); return Array.isArray(data.data)?data.data:[];
  }

  async pages(userId:string){
    const c=await this.connection(userId); const token=this.cryptoService.decrypt(c.accessTokenEnc!); const pages=await this.fetchPages(token); const meta=this.parseMetadata(c.metadata);
    return {items:pages.map(p=>({id:p.id,name:p.name,category:p.category||null,tasks:p.tasks||[],selected:p.id===(c.externalUserId||meta.selectedPageId)}))};
  }

  async selectPage(userId:string,pageId:string){
    const c=await this.connection(userId); const token=this.cryptoService.decrypt(c.accessTokenEnc!); const pages=await this.fetchPages(token); const page=pages.find(p=>p.id===pageId);
    if(!page)throw new UnauthorizedException('FACEBOOK_PAGE_NOT_AVAILABLE');
    const meta=this.parseMetadata(c.metadata);
    await this.db.channelConnection.update({where:{id:c.id},data:{externalUserId:page.id,metadata:JSON.stringify({...meta,selectedPageId:page.id,selectedPageName:page.name})}});
    return {ok:true,page:{id:page.id,name:page.name}};
  }

  async status(userId:string){
    const c=await this.db.channelConnection.findUnique({where:{userId_channel:{userId,channel:'FACEBOOK'}}}); const meta=this.parseMetadata(c?.metadata);
    return {configured:this.isConfigured(),connected:!!c&&c.status==='CONNECTED',status:c?.status||'NOT_CONNECTED',scopes:c?.scopes||null,externalUserId:c?.externalUserId||meta.selectedPageId||null,selectedPageName:meta.selectedPageName||null,pageCount:Array.isArray(meta.pages)?meta.pages.length:0,tokenExpiresAt:c?.tokenExpiresAt||null};
  }

  async me(userId:string){ const c=await this.connection(userId); const token=this.cryptoService.decrypt(c.accessTokenEnc!); return this.graph('/me?fields=id,name',token); }

  private async selectedPage(userId:string){
    const c=await this.connection(userId); const token=this.cryptoService.decrypt(c.accessTokenEnc!); const pages=await this.fetchPages(token); const meta=this.parseMetadata(c.metadata);
    const selectedId=c.externalUserId||meta.selectedPageId; if(!selectedId)throw new UnauthorizedException('FACEBOOK_PAGE_NOT_SELECTED');
    const page=pages.find(p=>p.id===selectedId); if(!page?.access_token)throw new UnauthorizedException('FACEBOOK_PAGE_TOKEN_UNAVAILABLE');
    return {page,pageToken:page.access_token};
  }

  async publishText(userId:string,input:{message:string;link?:string}){
    const {page,pageToken}=await this.selectedPage(userId); const url=new URL(`${this.graphBase()}/${page.id}/feed`); url.searchParams.set('access_token',pageToken);
    const proof=this.appSecretProof(pageToken); if(proof)url.searchParams.set('appsecret_proof',proof);
    const body:any={message:input.message.trim()}; if(input.link?.trim())body.link=input.link.trim();
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!response.ok)throw new Error(`FACEBOOK_PUBLISH_${response.status}:${await response.text()}`); return response.json();
  }

  async publishImage(userId:string,input:{imageUrl:string;caption?:string}){
    const {page,pageToken}=await this.selectedPage(userId); const url=new URL(`${this.graphBase()}/${page.id}/photos`); url.searchParams.set('access_token',pageToken);
    const proof=this.appSecretProof(pageToken); if(proof)url.searchParams.set('appsecret_proof',proof);
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:input.imageUrl.trim(),caption:input.caption||''})});
    if(!response.ok)throw new Error(`FACEBOOK_PHOTO_PUBLISH_${response.status}:${await response.text()}`); return response.json();
  }

  async currentUser(req:any){ const h=req.headers.authorization||''; return this.auth.userFromToken(h.startsWith('Bearer ')?h.slice(7):undefined); }
}
