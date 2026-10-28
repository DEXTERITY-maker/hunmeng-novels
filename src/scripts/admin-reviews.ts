import { getStaffRole, rest } from '../lib/backend';

interface ReviewRow {
  id:string; novel_slug:string; body:string; status:'pending'|'approved'|'rejected'; created_at:string;
}
export async function initAdminReviews(){
 const section=document.getElementById('admin-reader-reviews')!;
 const list=document.getElementById('admin-reader-reviews-list')!;
 const notice=document.getElementById('admin-reader-reviews-status')!;
 const refresh=document.getElementById('admin-reader-reviews-refresh') as HTMLButtonElement;
 if(await getStaffRole()!=='admin')return;
 section.hidden=false;
 let busy=false;
 const load=async()=>{
  notice.textContent='Loading reader reviews…';
  const rows=await rest<ReviewRow[]>('reader_reviews','GET',
   'select=id,novel_slug,body,status,created_at&order=created_at.desc&limit=60');
  list.replaceChildren();
  const pending=rows.filter(review=>review.status==='pending');
  const moderated=rows.filter(review=>review.status!=='pending');
  const ordered=[...pending,...moderated];
  notice.textContent=ordered.length
   ?`${pending.length} pending review(s). Showing up to 60 submissions.`
   :'No reader reviews have been submitted.';
  for(const item of ordered){
   const article=document.createElement('article');
   article.className='admin-reader-review';
   const title=document.createElement('h3');
   title.textContent=`${item.novel_slug} · ${item.status}`;
   const body=document.createElement('p');
   body.textContent=item.body;
   const meta=document.createElement('small');
   meta.textContent=new Date(item.created_at).toLocaleDateString();
   const actions=document.createElement('div');
   actions.className='admin-actions';
   for(const target of ['approved','rejected'] as const){
    if(item.status===target)continue;
    const button=document.createElement('button');
    button.type='button';button.className='button secondary';
    button.textContent=target==='approved'?'Approve':'Reject / revoke';
    button.addEventListener('click',async()=>{
     if(busy)return;
     busy=true;
     button.disabled=true;
     notice.textContent='Saving review moderation…';
     try{
      const updated=await rest<ReviewRow[]>('reader_reviews','PATCH',
       'id=eq.'+encodeURIComponent(item.id)+'&status=eq.'+encodeURIComponent(item.status)+'&select=id,status',
       {status:target});
      if(updated.length!==1)throw new Error('Another administrator changed this review. Refresh the queue.');
      await load();
      notice.textContent='Review moderation saved and reflected in verified title eligibility.';
     }catch{
      notice.textContent='Moderation failed. The review was not confirmed as updated; refresh and retry.';
      button.disabled=false;
     }finally{busy=false;}
    });
    actions.append(button);
   }
   article.append(title,body,meta,actions);list.append(article);
  }
 };
 refresh.addEventListener('click',()=>{void load().catch(()=>{notice.textContent='Unable to load reviews. Check your administrator access.';});});
 await load().catch(()=>{notice.textContent='Unable to load reviews. Check your administrator access.';});
}
