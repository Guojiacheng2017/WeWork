type GroupApi = {
  sendTeamMessage(teamId:string,text:string,actor?:unknown,contextTagIds?:string[]):Promise<unknown>;
  postGroupMessage?: (teamId:string,input:{text:string;recipientId?:string;requestId:string;contextTagIds?:string[]})=>Promise<unknown>;
};

export async function publishGroupMessage(api:GroupApi,managedHost:boolean,teamId:string,text:string,recipientId?:string,contextTagIds?:string[]) {
  if(managedHost && recipientId) {
    if(!api.postGroupMessage)throw new Error('WeWork Host does not support group dispatch');
    return api.postGroupMessage(teamId,{text,recipientId,requestId:crypto.randomUUID(),contextTagIds});
  }
  // A web preview must not enqueue a future model call during Desktop migration.
  return api.sendTeamMessage(teamId,text,undefined,contextTagIds);
}
