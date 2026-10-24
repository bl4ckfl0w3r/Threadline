import {bindings,json,owner} from '@/server/runtime';
export async function GET(request:Request){const config=bindings();let signedIn=false;try{await owner(request);signedIn=true;}catch{}return json({qloo:!!config.QLOO_API_KEY,model:!!(config.MODEL_API_KEY&&config.MODEL_NAME&&config.MODEL_BASE_URL),storage:!!config.DB,signedIn,...(signedIn&&config.MODEL_NAME?{modelName:config.MODEL_NAME}:{})});}
