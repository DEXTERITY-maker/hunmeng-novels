#!/usr/bin/env python3
"""Install the six premium Reader's Path badges from a user-approved ZIP.

Usage (from Hunmeng repository root):
  python scripts/import-legend-emblems.py /path/to/Hunmeng_Legend_Style_Emblems_Ready_To_Install.zip

The archive must be supplied explicitly; this installer never downloads
unapproved images, rewrites ranks/XP, or publishes without separate CI.
"""
from pathlib import Path
from zipfile import ZipFile
import sys

TIERS=('novice','reader','experienced','connoisseur','master','legend')
PREFIXES=('hunmeng_legend_style_pack/public/images/mastery/',
          'Hunmeng_Emblems_Legend_Edition/public/images/mastery/',
          'public/images/mastery/')
REPLACEMENTS={
 'src/lib/reader-progression.ts':[
  ('export const masteryImage = (id: string) => `/images/mastery/${id}.svg`;',
   'export const masteryImage = (id: string) => `/images/mastery/${id}.webp`;')],
 'src/components/ReaderAdvancement.astro':[
  ('width="260" height="300" loading="lazy" decoding="async"',
   'width="640" height="640" loading="lazy" decoding="async"'),
  ('alt="New Reader\'s Path emblem" width="260" height="300"',
   'alt="New Reader\'s Path emblem" width="640" height="640"')],
 'src/styles/presentation.css':[
  ('max-width:100%;max-height:186px;aspect-ratio:260/300;object-fit:contain;',
   'max-width:100%;max-height:186px;aspect-ratio:1/1;object-fit:contain;')],
}
TEST='tests/mastery-emblems.test.mjs'
BEGIN="test('six different transparent, compact, labeled SVG illustrations are available'"
END="test('rank and mastery progression remain independent with unchanged cutoffs'"
TEST_REPLACEMENT="""test('six distinct optimized WebP mastery illustrations are available',()=>{
 const resources=new Set();
 assert.deepEqual(readerMasteryTiers.map(tier=>tier.id),keys);
 for(const tier of readerMasteryTiers){
  const name=masteryImage(tier.id);
  assert.equal(name,`/images/mastery/${tier.id}.webp`);
  const path=join(root,'public',name.slice(1));
  const bytes=readFileSync(path);
  assert.ok(statSync(path).size<300000,`${tier.id} should remain optimized`);
  assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF');
  assert.equal(bytes.subarray(8,12).toString('ascii'),'WEBP');
  const key=bytes.toString('base64');
  assert.equal(resources.has(key),false,'Each emblem must have unique art');
  resources.add(key);
 }
});
"""
def main():
 if len(sys.argv)!=2:raise SystemExit(__doc__)
 root=Path.cwd().resolve()
 modifications={}
 for relative,rules in REPLACEMENTS.items():
  file=root/relative
  if not file.is_file():raise SystemExit('Missing repository file: '+str(file))
  content=file.read_text('utf-8')
  for old,new in rules:
   if new in content:continue
   if content.count(old)!=1:raise SystemExit('Unexpected upstream code in '+relative)
   content=content.replace(old,new)
  modifications[file]=content
 test=root/TEST
 if test.is_file():
  content=test.read_text('utf-8')
  start=content.find(BEGIN);end=content.find(END,start)
  if start>=0 and end>start:
   modifications[test]=content[:start]+TEST_REPLACEMENT+content[end:]
  elif TEST_REPLACEMENT not in content:
   raise SystemExit('Unexpected existing mastery test; refusing incomplete migration')
 with ZipFile(Path(sys.argv[1]).expanduser()) as archive:
  names=set(archive.namelist());assets={}
  for tier in TIERS:
   for ext in ('png','webp'):
    filename=tier+'.'+ext
    candidates=[prefix+filename for prefix in PREFIXES if prefix+filename in names]
    if len(candidates)!=1:raise SystemExit('Missing archive asset: '+filename)
    binary=archive.read(candidates[0])
    if ext=='png':
     valid=binary.startswith(b'\x89PNG\r\n\x1a\n') and binary[16:24]==(640).to_bytes(4,'big')*2 and binary[25]==6
    else:
     valid=binary[:4]==b'RIFF' and binary[8:12]==b'WEBP' and len(binary)<300000
    if not valid:raise SystemExit('Invalid image: '+filename)
    assets[filename]=binary
 target=root/'public/images/mastery';target.mkdir(parents=True,exist_ok=True)
 for filename,binary in assets.items():(target/filename).write_bytes(binary)
 for file,content in modifications.items():file.write_text(content,encoding='utf-8')
 print('Installed six new premium mastery badges in both WebP and PNG.')
 print('Run: npm run build && node --test tests/mastery-emblems.test.mjs && npm test')
if __name__=='__main__':main()
