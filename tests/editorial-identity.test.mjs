import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('editorial redesign is presentation-only and applied last',()=>{
 const layout=readFileSync('src/layouts/Layout.astro','utf8');
 const presentation=readFileSync('src/styles/presentation.css','utf8');
 const marker='/* Section: editorial-identity-20261029';
 assert.ok(presentation.includes(marker));
 const css=presentation.slice(presentation.indexOf(marker));
 assert.match(layout,/import '\.\.\/styles\/presentation\.css'/);
 assert.ok(layout.indexOf('pages.css')<layout.indexOf('presentation.css'));
 assert.ok(presentation.indexOf('/* Section: quick-polish-20261029')<presentation.indexOf(marker));
 assert.match(css,/html\[data-theme='dark'\]/);
 assert.match(css,/html\[data-theme='sepia'\]/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(css,/\.request|\.admin|service_role|\.supabase|\.reader-advancement/);
});
test('redesign has an accurate news announcement and an explicit release gate',()=>{
 const post=readFileSync('src/content/news/editorial-redesign-2026-10-29.md','utf8');
 const workflow=readFileSync('.github/workflows/pages-manual-draft.yml','utf8');
 assert.match(post,/^category: changelog$/m);
 assert.match(post,/^publishedAt: "2026-10-29"$/m);
 assert.match(post,/^order: 600$/m);
 assert.match(post,/\[Explore the catalog\]\(\/catalog\/\)/);
 assert.match(post,/novel-request system is not part of this release/);
 assert.match(workflow,/startsWith\(github\.event\.head_commit\.message, 'design\(ui\): publish Hunmeng editorial redesign 2026-10-29 \[deploy cloudflare\]'/);
 assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/APPROVED_SHA.*GITHUB_SHA/);
});
