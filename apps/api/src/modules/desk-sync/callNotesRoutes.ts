import type { Express, Request, Response, RequestHandler } from 'express'
import type { Pool } from 'pg'
import { z } from 'zod'
import { getUserId, requireBrokerAuth, requireSalesActivityAuth } from '../../auth'
import { editCallNote, finishCallSuggestion, interpretation, interpretCallNote, noteEdit, pendingCallNotes, suggestedCalls } from '../../lib/callNotes'

const handle = (action: (req:Request, res:Response, owner:string)=>Promise<unknown>):RequestHandler =>
  (req,res,next) => {
    res.set('Cache-Control','private, no-store')
    const owner = getUserId(req)
    if (!owner || owner === 'demo-user' || req.headers['x-demo-mode'] === 'true') return void res.sendStatus(403)
    action(req,res,owner).catch(error => {
      if (error instanceof z.ZodError) return res.status(400).json({message:'Invalid call note or recommendation.'})
      if ([404,409].includes(error.status)) return res.status(error.status).json({message:error.message})
      next(error)
    })
  }

export function registerCallNotes(app:Express, db:Pool) {
  app.patch('/api/calling/prospects/:prospectId/calls/:id/note',requireBrokerAuth,handle(async(req,res,owner)=>{
    res.json(await editCallNote(db,owner,req.params.prospectId,req.params.id,noteEdit.parse(req.body)))
  }))
  app.patch('/api/calling/prospects/:prospectId/company-note',requireBrokerAuth,handle(async(req,res,owner)=>{
    const input=z.object({expectedNotes:z.string(),notes:z.string().trim().max(20000)}).strict().parse(req.body)
    const {rows}=await db.query(`UPDATE public.prospects SET notes=$4, updated_at=now()
      WHERE user_id=$1 AND id=$2 AND merged_into_prospect_id IS NULL AND COALESCE(notes,'') IN ($3,$4)
      RETURNING notes`,[owner,req.params.prospectId,input.expectedNotes,input.notes])
    if (!rows.length) return res.status(409).json({message:'Company notes changed. Reload before saving.'})
    res.json(rows[0])
  }))
  app.get('/api/desk/call-follow-ups',requireBrokerAuth,handle(async(_req,res,owner)=>{
    res.json({rows:(await suggestedCalls(db,owner)).rows})
  }))
  app.post('/api/desk/call-follow-ups/:id/finish',requireBrokerAuth,handle(async(req,res,owner)=>{
    const input=z.object({revision:z.string().uuid(),state:z.enum(['done','dismissed'])}).strict().parse(req.body)
    await finishCallSuggestion(db,owner,req.params.id,input.revision,input.state)
    res.json({state:input.state})
  }))
  const workerOnly:RequestHandler=(req,res,next)=>{
    const configuredOwner = process.env.SALES_ACTIVITY_AGENT_USER_ID || process.env.INTEL_AGENT_USER_ID
    if (!configuredOwner || getUserId(req)!==configuredOwner || (req as any).user?.role !== 'sales_activity_agent') return void res.sendStatus(403)
    next()
  }
  const agent='/api/agent/desk-sync/call-notes'
  app.get(agent,requireSalesActivityAuth,workerOnly,handle(async(_req,res,owner)=>{
    const {rows}=await pendingCallNotes(db,owner)
    res.json({rows:rows.slice(0,20),more:rows.length>20})
  }))
  app.post(agent+'/:id/review',requireSalesActivityAuth,workerOnly,handle(async(req,res,owner)=>{
    res.json(await interpretCallNote(db,owner,req.params.id,interpretation.parse(req.body)))
  }))
}
