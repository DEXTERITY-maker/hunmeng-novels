import {handleWebhook} from '../../scripts/telegram-bot/webhook.mjs';
export const onRequest = ({request, env}) => handleWebhook(request, env);
