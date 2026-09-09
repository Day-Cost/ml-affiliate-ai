import {Injectable} from '@nestjs/common';
import axios from 'axios';
import {ScoringService} from '../scoring/scoring.service';
@Injectable()
export class ProductHunterService{
 constructor(private scoring:ScoringService){}
 async search(query:string){
  if(!query.trim()) return {query,items:[]};
  const {data}=await axios.get('https://api.mercadolibre.com/sites/MLB/search',{params:{q:query,limit:20}});
  const items=(data.results||[]).map((p:any)=>{const discount=p.original_price&&p.price?Math.max(0,((p.original_price-p.price)/p.original_price)*100):0;const quality=Math.min(100,Number(p.reviews?.rating_average||4)*20);const score=this.scoring.calculate({demand:50,conversion:50,commission:50,discount,quality,competition:50,trend:50,content:70});return {id:p.id,title:p.title,price:p.price,originalPrice:p.original_price,rating:p.reviews?.rating_average||null,reviewsCount:p.reviews?.total||0,thumbnail:p.thumbnail,permalink:p.permalink,score};});
  return {query,total:data.paging?.total||items.length,items};
 }
 top(){return {status:'READY',message:'Use /products/search?q=... to populate candidates.'};}
}
