import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import * as path from 'path';

@Controller('media/generate')
export class ProductVideoController {
  @Get('product.mp4')
  async productVideo(@Query('imageUrl') imageUrl: string, @Res() res: Response) {
    let url: URL;
    try { url = new URL(imageUrl); } catch { return res.status(400).send('INVALID_IMAGE_URL'); }
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.mlstatic.com')) return res.status(400).send('IMAGE_HOST_NOT_ALLOWED');
    const source = await fetch(url.toString());
    if (!source.ok) return res.status(502).send('IMAGE_SOURCE_UNAVAILABLE');
    const contentType = (source.headers.get('content-type') || '').split(';')[0];
    if (!['image/jpeg','image/png','image/webp'].includes(contentType)) return res.status(400).send('UNSUPPORTED_IMAGE_TYPE');
    const id = randomUUID();
    const input = path.join('/tmp', `${id}.img`);
    const output = path.join('/tmp', `${id}.mp4`);
    try {
      await fs.writeFile(input, Buffer.from(await source.arrayBuffer()));
      await new Promise<void>((resolve, reject) => {
        const ff = spawn('ffmpeg', ['-y','-loglevel','error','-loop','1','-i',input,'-vf',"scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,zoompan=z='min(zoom+0.0008,1.08)':d=150:s=720x1280:fps=30",'-t','5','-an','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',output]);
        ff.on('error', reject); ff.on('close', code => code === 0 ? resolve() : reject(new Error(`FFMPEG_EXIT_${code}`)));
      });
      const video = await fs.readFile(output);
      res.setHeader('Content-Type','video/mp4');
      res.setHeader('Cache-Control','public, max-age=300');
      return res.end(video);
    } catch (error: any) { return res.status(500).send(String(error?.message || 'VIDEO_RENDER_FAILED')); }
    finally { await fs.rm(input,{force:true}).catch(()=>{}); await fs.rm(output,{force:true}).catch(()=>{}); }
  }
}
