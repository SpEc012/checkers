import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
const time = name => integer(name,{mode:'timestamp_ms'});
export const user = sqliteTable('ln_user',{id:text('id').primaryKey(),name:text('name').notNull(),email:text('email').notNull().unique(),emailVerified:integer('email_verified',{mode:'boolean'}).notNull().default(false),image:text('image'),createdAt:time('created_at').notNull(),updatedAt:time('updated_at').notNull()});
export const session = sqliteTable('ln_session',{id:text('id').primaryKey(),token:text('token').notNull().unique(),userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),expiresAt:time('expires_at').notNull(),createdAt:time('created_at').notNull(),updatedAt:time('updated_at').notNull(),ipAddress:text('ip_address'),userAgent:text('user_agent')});
export const account = sqliteTable('ln_account',{id:text('id').primaryKey(),accountId:text('account_id').notNull(),providerId:text('provider_id').notNull(),userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),accessToken:text('access_token'),refreshToken:text('refresh_token'),idToken:text('id_token'),accessTokenExpiresAt:time('access_token_expires_at'),refreshTokenExpiresAt:time('refresh_token_expires_at'),scope:text('scope'),password:text('password'),createdAt:time('created_at').notNull(),updatedAt:time('updated_at').notNull()});
export const verification = sqliteTable('ln_verification',{id:text('id').primaryKey(),identifier:text('identifier').notNull(),value:text('value').notNull(),expiresAt:time('expires_at').notNull(),createdAt:time('created_at'),updatedAt:time('updated_at')});
export const rateLimit = sqliteTable('ln_rate_limit',{id:text('id').primaryKey(),key:text('key').notNull().unique(),count:integer('count').notNull(),lastRequest:integer('last_request').notNull()});
export function notesConfigured(env) { return !!(env.BETTER_AUTH_SECRET?.length>=32 && env.NOTES_ORIGIN && env.NOTES_EMAIL_FROM && (env.EMAIL || env.RESEND_API_KEY)); }
export function createNotesAuth(env) {
  if(!notesConfigured(env)) throw Object.assign(new Error('Love Notes sign-in is waiting for email setup. The arcade is still available.'),{status:503});
  return betterAuth({
    appName:'Two Lovebugs', baseURL:env.NOTES_ORIGIN, basePath:'/api/auth',secret:env.BETTER_AUTH_SECRET,
    trustedOrigins:[env.NOTES_ORIGIN],database:drizzleAdapter(drizzle(env.DB),{provider:'sqlite',schema:{user,session,account,verification,rateLimit}}),
    session:{expiresIn:60*60*24*30,updateAge:60*60*24,cookieCache:{enabled:false}},
    advanced:{cookiePrefix:'lovebugs',useSecureCookies:env.NOTES_ORIGIN.startsWith('https:'),ipAddress:{ipAddressHeaders:['cf-connecting-ip']}},
    rateLimit:{enabled:true,storage:'database',window:60,max:60,customRules:{'/email-otp/send-verification-otp':{window:60,max:3},'/sign-in/email-otp':{window:60,max:6}}},
    plugins:[emailOTP({otpLength:6,expiresIn:600,allowedAttempts:5,storeOTP:'hashed',async sendVerificationOTP({email,otp}) {
      const message={from:env.NOTES_EMAIL_FROM,to:email,subject:'Your Two Lovebugs sign-in code',text:`Your sign-in code is ${otp}. It expires in 10 minutes. If you did not request this code, ignore this email.`};
      if(env.EMAIL) await env.EMAIL.send(message);
      else {
        const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(message)});
        if(!r.ok) throw new Error('Could not send the sign-in email. Please try again later.');
      }
    }})],
  });
}
