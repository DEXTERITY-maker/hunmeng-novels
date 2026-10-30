import sharp from 'sharp';
import {readdir,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const before=process.argv[2], after=process.argv[3], out=process.argv[4];
await mkdir(out,{recursive:true});
const first=(await readdir(before)).filter(x=>x.endsWith('.png')).sort();
const second=(await readdir(after)).filter(x=>x.endsWith('.png')).sort();
if(first.length!==72 || JSON.stringify(first)!==JSON.stringify(second))throw Error(`Screenshot set mismatch: ${first.length} before, ${second.length} after`);
const results=[];
for(const name of first){
 const a=await sharp(join(before,name)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const b=await sharp(join(after,name)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(a.info.width!==b.info.width || a.info.height!==b.info.height){results.push({name,dimensionMismatch:true,before:[a.info.width,a.info.height],after:[b.info.width,b.info.height]});continue;}
 let changed=0, sum=0;
 for(let i=0;i<a.data.length;i+=4){let d=Math.max(Math.abs(a.data[i]-b.data[i]),Math.abs(a.data[i+1]-b.data[i+1]),Math.abs(a.data[i+2]-b.data[i+2]),Math.abs(a.data[i+3]-b.data[i+3]));if(d>3)changed++;sum+=d;}
 const total=a.info.width*a.info.height;
 results.push({name,width:a.info.width,height:a.info.height,changed,ratio:changed/total,mean:sum/total});
}
await writeFile(join(out,'comparison.json'),JSON.stringify(results,null,2));
const anomalies=results.filter(r=>r.dimensionMismatch || r.ratio>0.0001);
console.log(JSON.stringify({scenarios:results.length,exact:results.filter(r=>r.changed===0).length,threshold:0.0001,anomalies},null,2));
if(anomalies.length)process.exitCode=1;
