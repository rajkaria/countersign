'use client';
import { useState } from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
interface WalletProvider{request(args:{method:string;params?:unknown[]}):Promise<unknown>}
export default function Login(){
 const router=useRouter();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function signIn(){setBusy(true);setError('');try{
  const provider=(window as unknown as {ethereum?:WalletProvider}).ethereum;if(!provider)throw new Error('Open Countersign in a browser with an Ethereum wallet installed. You can explore the demo without a wallet.');
  const accounts=await provider.request({method:'eth_requestAccounts'}) as string[];const wallet=accounts[0];
  const challengeResponse=await fetch('/api/auth/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({wallet})});const challenge=await challengeResponse.json();if(!challengeResponse.ok)throw new Error(challenge.error.message);
  const signature=await provider.request({method:'personal_sign',params:[`0x${Array.from(new TextEncoder().encode(challenge.message)).map(b=>b.toString(16).padStart(2,'0')).join('')}`,wallet]});
  const response=await fetch('/api/auth/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challengeId:challenge.challengeId,signature})});const result=await response.json();if(!response.ok)throw new Error(result.error.message);router.push('/console');router.refresh();
 }catch(e){setError(e instanceof Error?e.message:'Sign in could not be completed.');}finally{setBusy(false);}}
 return <main id="main" className="account-page"><Link href="/" className="wordmark">Countersign<span>↗</span></Link><section className="account-card"><p className="eyebrow">YOUR WORKSPACE</p><h1>A clearer view of<br/>what you owe.</h1><p>Sign in with your wallet to create a private workspace. Start read-only. Your signature grants no access to your funds.</p><button className="button primary" disabled={busy} onClick={signIn}>{busy?'Waiting for your wallet…':'Sign in with Ethereum →'}</button>{error&&<p role="alert" className="form-error">{error}</p>}<div className="account-divider"/><p>No wallet needed to explore.</p><Link href="/workspace" className="text-link">Try the interactive demo →</Link><p className="small-muted">Workspace login currently supports EOA wallet signatures. Safe imports are read-only; signing authority stays with existing Safe owners.</p></section><Link href="/docs/security" className="text-link">How your data and permissions are protected</Link></main>;
}
