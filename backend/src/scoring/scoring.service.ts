import {Injectable} from '@nestjs/common';
export type ScoreInput={demand:number;conversion:number;commission:number;discount:number;quality:number;competition:number;trend:number;content:number};
@Injectable()
export class ScoringService{calculate(x:ScoreInput){let score=x.demand*.25+x.conversion*.20+x.commission*.15+x.discount*.10+x.quality*.10+x.competition*.10+x.trend*.05+x.content*.05;if(x.quality<50)score-=15;if(x.discount>=20)score+=5;if(x.trend>=75)score+=5;return Math.max(0,Math.min(100,Number(score.toFixed(2))));}}
