import OpenAI from 'openai';
import { authenticated } from '@/lib/server';
import { tutorInput, tutorContext, tutorInstructions } from '@/lib/tutor';

export const maxDuration = 30;
export async function POST(request: Request) {
  let auth;
  try { auth=await authenticated(request); }
  catch { return Response.json({error:'Sign in to use the AI tutor.'},{status:401}); }
  if (!process.env.OPENAI_API_KEY) return Response.json({error:'The tutor is not configured yet.'},{status:503});
  let input;
  try {
    const raw=await request.text();
    if(raw.length>16000) throw new Error('Too large');
    input=tutorInput.parse(JSON.parse(raw));
  } catch { return Response.json({error:'Please shorten your message and try again.'},{status:400}); }
  try {
    const {data,error}=await auth.db.rpc('mcat_claim_tutor',{p_session:input.sessionId,p_question:input.questionId});
    if(error) throw error;
    if(data?.error==='unavailable') return Response.json({error:'Submit this question first. Its original version must still be available.'},{status:403});
    if(data?.error==='limit') return Response.json({error:'The tutor allowance has been reached. Please try again tomorrow.'},{status:429});
    if(!data?.question) throw new Error('Missing context');
    const client=new OpenAI({timeout:22000,maxRetries:0});
    const response=await client.responses.create({
      model:process.env.OPENAI_TUTOR_MODEL || 'gpt-5.4-nano',
      store:false,
      reasoning:{effort:'none'},
      max_output_tokens:500,
      instructions:tutorInstructions,
      input:[{role:'developer',content:tutorContext(data.question,data.selected)},...input.history,{role:'user',content:input.message}],
    });
    if(!response.output_text?.trim()) throw new Error('Empty response');
    return Response.json({reply:response.output_text,remaining:data.remaining,truncated:response.status==='incomplete'});
  } catch(e) {
    console.error('Tutor unavailable',e instanceof OpenAI.APIError ? `provider status ${e.status}` : 'processing error');
    return Response.json({error:'The tutor could not reply. Your answer is saved. Please try again later.'},{status:503});
  }
}
