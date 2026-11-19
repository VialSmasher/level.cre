import { brokerCallDate } from './mobileCalling'

export type CallingVisit = {prospectId:string; contactId:string|null; phone:string}
export type CallingPosition = {
  current:CallingVisit|null; previous:CallingVisit[]; skipped:string[]; completed:string[]; includeCalledToday:boolean
}

const storageKey = (brokerId:string) => 'levelcre:calling-position:'+brokerId
const isVisit = (value:any):value is CallingVisit => !!value && typeof value.prospectId === 'string'
  && (value.contactId===null || typeof value.contactId==='string') && typeof value.phone==='string'

export function readCallingPosition(brokerId:string):CallingPosition|null {
  try {
    const saved=JSON.parse(sessionStorage.getItem(storageKey(brokerId)) || 'null')
    if (!saved || saved.day!==brokerCallDate(new Date()) || (saved.current!==null && !isVisit(saved.current))
      || !Array.isArray(saved.previous) || !saved.previous.every(isVisit)
      || ![saved.skipped,saved.completed].every(items=>Array.isArray(items) && items.every(id=>typeof id==='string'))) return null
    return saved
  } catch { return null }
}
export function saveCallingPosition(brokerId:string, position:CallingPosition, day:string) {
  try { sessionStorage.setItem(storageKey(brokerId),JSON.stringify({...position,day})) } catch {}
}
