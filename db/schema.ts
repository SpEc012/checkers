import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const rooms=sqliteTable('rooms',{
 id:text('id').primaryKey(),name:text('name').notNull(),host:text('host').notNull(),guest:text('guest'),hostName:text('host_name').notNull(),guestName:text('guest_name'),hostSide:text('host_side').notNull(),pin:text('pin'),state:text('state').notNull(),score:text('score').notNull(),messages:text('messages').notNull(),rematch:text('rematch'),revision:integer('revision').notNull().default(0),hostSeen:integer('host_seen').notNull(),guestSeen:integer('guest_seen').notNull().default(0),updated:integer('updated').notNull(),closed:integer('closed').notNull().default(0)
},t=>[index('idx_rooms_active').on(t.closed,t.updated)]);
