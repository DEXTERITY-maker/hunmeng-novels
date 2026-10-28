import {createReaderClient,readerAuthConfigured} from '../lib/reader-auth';

export async function initReaderReviews() {
 const root=document.querySelector<HTMLElement>('[data-reader-reviews]');
 if(!root)return;
 const slug=root.dataset.novel!;
 const status=root.querySelector<HTMLElement>('[data-reviews-status]')!;
 const list=root.querySelector<HTMLOListElement>('[data-published-reviews]')!;
 const form=root.querySelector<HTMLFormElement>('[data-review-form]')!;
 const auth=root.querySelector<HTMLElement>('[data-review-auth]')!;
 const feedback=root.querySelector<HTMLElement>('[data-review-feedback]')!;
 if(!readerAuthConfigured){
  status.textContent='Reviews are unavailable until the account service is configured.';
  return;
 }
 const client=createReaderClient();
 const renderPublic=async()=>{
  const {data,error}=await client.from('reader_published_reviews')
    .select('id,body,created_at').eq('novel_slug',slug)
    .order('created_at',{ascending:false}).limit(10);
  list.replaceChildren();
  if(error){status.textContent='Unable to load reviews. Please try again later.';return;}
  if(!data?.length){status.textContent='No approved reviews yet.';return;}
  status.textContent=data.length===10?'Showing the 10 newest approved reviews.':`${data.length} approved review(s)`;
  for(const item of data){
   const li=document.createElement('li');
   const content=document.createElement('p');
   content.textContent=item.body;
   const time=document.createElement('time');
   time.dateTime=item.created_at;
   time.textContent=new Date(item.created_at).toLocaleDateString();
   li.append(content,time);list.append(li);
  }
 };
 const refreshAuth=async()=>{
  const {data,error}=await client.auth.getSession();
  const user=data.session?.user;
  if(error||!user){form.hidden=true;auth.hidden=false;return;}
  auth.hidden=true;
  const own=await client.from('reader_reviews').select('status')
   .eq('user_id',user.id).eq('novel_slug',slug).maybeSingle();
  if(own.error){form.hidden=true;feedback.textContent='Unable to verify your review status. Please retry later.';return;}
  if(own.data){
   form.hidden=true;
   feedback.textContent=own.data.status==='approved'?'Your review is published.':
    own.data.status==='rejected'?'Your review was not approved.':'Your review is awaiting moderation.';
  }else{form.hidden=false;feedback.textContent='';}
 };
 let submitting=false;
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(submitting)return;
  const input=form.querySelector<HTMLTextAreaElement>('textarea')!;
  const body=input.value.trim();
  if(body.length<120||body.length>4000||body.split(/\s+/u).length<20){
   feedback.textContent='Please write at least 120 characters and 20 words.';return;
  }
  submitting=true;
  const button=form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  button.disabled=true;feedback.textContent='Submitting for moderation…';
  try{
   const {data,error}=await client.rpc('reader_submit_review',{p_novel:slug,p_body:body});
   if(error){feedback.textContent='Unable to submit the review. Check its length, your connection and submission limit.';return;}
   form.hidden=true;
   feedback.textContent=data?'Your review was submitted for moderation.':'You have already submitted a review of this novel.';
  }catch{
   feedback.textContent='Unable to reach the review service. Your text has not been deleted.';
  }finally{submitting=false;button.disabled=false;}
 });
 void renderPublic();
 void refreshAuth();
 window.addEventListener('reader:auth-change',()=>void refreshAuth());
}
