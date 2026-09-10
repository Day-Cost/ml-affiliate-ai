import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';

@Controller('media/test')
export class TestMediaController {
  @Get('tiktok.mp4')
  async video(@Res() res: Response) {
    const source = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
    const upstream = await fetch(source);
    if (!upstream.ok || !upstream.body) return res.status(502).send('TEST_VIDEO_SOURCE_UNAVAILABLE');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.end(Buffer.from(await upstream.arrayBuffer()));
  }
}
