const bare=(host:string)=>host.toLowerCase().replace(/\.$/,'').replace(/^www\./,'');
const isPublicName=(host:string)=>host.includes('.')&&!host.startsWith('[')&&!/^[\d.]+$/.test(host)&&!/\.(?:local|localhost|internal|intranet|lan|home|corp|test|invalid|example)$/i.test(bare(host))&&bare(host)!=='localhost';

export function leadHost(website?:string) {
  if(!website)return undefined;
  try{const host=new URL(website).hostname;return isPublicName(host)?bare(host):undefined;}catch{return undefined;}
}
// A place's own website, with or without www. A lead's website only ever comes from Qloo.
export function isLeadHost(hostname:string,website?:string) {
  const host=leadHost(website);return !!host&&bare(hostname)===host;
}
