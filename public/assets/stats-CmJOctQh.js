import{j as e}from"./maps-BkP_85Bm.js";import{u as M}from"./query-BAwt2wOP.js";import{c as L,g as Y,P as F,h as Q,i as J,f as ee,e as se}from"./index-DIhazG7A.js";import{C as j,a as b,b as E,c as _}from"./card-CVaT3zxn.js";import{r as w}from"./react-BUvn9Qyq.js";import{B as U}from"./badge-BzWFgtZE.js";import{T as te}from"./target-BbIdDTai.js";import{Z as I}from"./zap-DP8WwCqM.js";import{M as K}from"./map-pin-C6sM-pao.js";import{P as re}from"./phone-Dz66gF6o.js";import"./supabase-LVwxr6rx.js";import"./charts-Ciu5p52_.js";const C=L("Crown",[["path",{d:"M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z",key:"1vdc57"}],["path",{d:"M5 21h14",key:"11awu3"}]]);const ae=L("Star",[["polygon",{points:"12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2",key:"8f66p6"}]]);const le=L("TrendingUp",[["polyline",{points:"22 7 13.5 15.5 8.5 10.5 2 17",key:"126l90"}],["polyline",{points:"16 7 22 7 22 13",key:"kwv8wd"}]]);const ie=L("Trophy",[["path",{d:"M6 9H4.5a2.5 2.5 0 0 1 0-5H6",key:"17hqa7"}],["path",{d:"M18 9h1.5a2.5 2.5 0 0 0 0-5H18",key:"lmptdp"}],["path",{d:"M4 22h16",key:"57wxv0"}],["path",{d:"M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22",key:"1nw9bq"}],["path",{d:"M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22",key:"1np0yb"}],["path",{d:"M18 2H6v7a6 6 0 0 0 12 0V2Z",key:"u46fv3"}]]);var A="Progress",ne=100,[oe]=Y(A),[ce,de]=oe(A),q=w.forwardRef((s,t)=>{const{__scopeProgress:c,value:a=null,max:l,getValueLabel:d=pe,...p}=s;(l||l===0)&&z(l);const i=z(l)?l:ne;a!==null&&R(a,i);const m=R(a,i)?a:null,k=P(m)?d(m,i):void 0;return e.jsx(ce,{scope:c,value:m,max:i,children:e.jsx(F.div,{"aria-valuemax":i,"aria-valuemin":0,"aria-valuenow":P(m)?m:void 0,"aria-valuetext":k,role:"progressbar","data-state":X(m,i),"data-value":m??void 0,"data-max":i,...p,ref:t})})});q.displayName=A;var B="ProgressIndicator",V=w.forwardRef((s,t)=>{const{__scopeProgress:c,...a}=s,l=de(B,c);return e.jsx(F.div,{"data-state":X(l.value,l.max),"data-value":l.value??void 0,"data-max":l.max,...a,ref:t})});V.displayName=B;function pe(s,t){return`${Math.round(s/t*100)}%`}function X(s,t){return s==null?"indeterminate":s===t?"complete":"loading"}function P(s){return typeof s=="number"}function z(s){return P(s)&&!isNaN(s)&&s>0}function R(s,t){return P(s)&&!isNaN(s)&&s<=t&&s>=0}var O=q,xe=V;const H=w.forwardRef(({className:s,value:t,...c},a)=>e.jsx(O,{ref:a,className:Q("relative h-4 w-full overflow-hidden rounded-full bg-secondary",s),...c,children:e.jsx(xe,{className:"h-full w-full flex-1 bg-primary transition-all",style:{transform:`translateX(-${100-(t||0)}%)`}})}));H.displayName=O.displayName;const T={prospecting:"#1E90FF",followup:"#10B981",consistency:"#F59E0B",knowledge:"#6366F1"};function me({events:s,unitXp:t=10}){const c=s,a=60,l=w.useMemo(()=>{const r=[],n=[...c].sort((o,u)=>{const f=o.timestamp?new Date(o.timestamp).getTime():0,g=u.timestamp?new Date(u.timestamp).getTime():0;return f-g});for(const o of n){const u=o.xpGained||0,f=Math.floor(u/t);for(let g=0;g<f;g++)r.push({id:`${o.id}-brick-${g}`,category:k(o.skillType),action:o.action,created_at:o.timestamp?o.timestamp.toString():new Date().toISOString(),unitXp:t});if(r.length>=1500)break}return r.slice(0,1500)},[c,t]),d=l.length*t,p=w.useMemo(()=>{const r=[];for(let n=0;n<l.length;n+=a)r.push(l.slice(n,n+a));return r},[l]),i=r=>Math.floor(r**2*100),m=w.useMemo(()=>{const r=new Map;for(let n=1;n<=99;n++){const o=i(n);if(o>d)break;const u=Math.ceil(o/t);if(u<=0)continue;const f=Math.floor((u-1)/a),g=r.get(f)||[];g.push(n),r.set(f,g)}return r},[d,t]);function k(r){switch(r){case"prospecting":return"prospecting";case"followUp":return"followup";case"consistency":return"consistency";case"marketKnowledge":return"knowledge";default:return"prospecting"}}function v(r){return T[r]||T.prospecting}function x(r){const n=new Date(r);return n.toLocaleDateString()+" "+n.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}const N=()=>p.map((r,n)=>{const o=n+1,u=o%10===0,f=o*a*t,g=m.get(n)||[];return e.jsxs("div",{className:"course-row",children:[e.jsx("div",{className:"gutter",children:u?e.jsxs("span",{className:"gutter-label",children:[f.toLocaleString()," XP"]}):e.jsx("span",{className:"gutter-spacer"})}),e.jsxs("div",{className:"course","aria-label":`Course ${o}`,children:[r.map((h,Z)=>{const W=v(h.category),D=`${h.category} · ${h.action.replace("_"," ")} · +${h.unitXp} XP · ${x(h.created_at)}`;return e.jsx("div",{className:"brick",style:{backgroundColor:W,animationDelay:`${Z%a*5}ms`},title:D,"aria-label":D},h.id)}),g.length>0&&e.jsx("div",{className:"capstones","aria-hidden":!0,children:g.map(h=>e.jsxs("span",{className:"capstone-pill",children:["Lvl ",h]},`cap-${h}`))})]})]},`course-row-${n}`)});return c.length===0?e.jsxs("div",{className:"text-center py-8 text-gray-500",children:[e.jsx("div",{className:"text-4xl mb-3",children:"🧱"}),e.jsx("p",{children:"No XP yet—add a prospect or log a follow-up to start building your foundation."})]}):e.jsxs("div",{className:"foundation-wall",children:[e.jsx("style",{children:`
        .foundation-wall {
          --brick-size-mobile: 10px;
          --brick-height-mobile: 6px;
          --gap-mobile: 1.5px;
          --brick-size-tablet: 12px;
          --brick-height-tablet: 7px;
          --gap-tablet: 2px;
          --brick-size-desktop: 14px;
          --brick-height-desktop: 8px;
          --gap-desktop: 2px;
        }

        .info-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding: 0.75rem;
          background: #f9fafb;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
        }

        .info-stats {
          font-size: 0.875rem;
          color: #6b7280;
        }

        .stack {
          display: flex;
          flex-direction: column-reverse; /* bottom-up build */
          gap: 2px;
          margin-bottom: 0.75rem;
        }

        .course-row {
          display: grid;
          grid-template-columns: 64px 1fr; /* gutter + course */
          align-items: center;
          gap: 8px;
        }

        .gutter {
          display: flex;
          justify-content: flex-end;
          align-items: center;
        }

        .gutter-label {
          font-size: 10px;
          color: #6b7280;
          background: #f3f4f6;
          border: 1px solid #e5e7eb;
          border-radius: 999px;
          padding: 2px 6px;
          white-space: nowrap;
        }

        .gutter-spacer { height: 1px; }

        .course {
          display: grid;
          grid-template-columns: repeat(var(--cols, 60), var(--brick-size-mobile));
          gap: var(--gap-mobile);
          position: relative;
        }

        .brick {
          width: var(--brick-size-mobile);
          height: var(--brick-height-mobile);
          border-radius: 2px;
          cursor: pointer;
          transition: transform 0.1s ease;
        }

        .brick:hover {
          transform: scale(1.1);
        }

        .capstones {
          position: absolute;
          right: -2px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .capstone-pill {
          font-size: 10px;
          color: #111827;
          background: #fde68a;
          border: 1px solid #fbbf24;
          padding: 1px 4px;
          border-radius: 6px;
        }

        @media (min-width: 768px) {
          .course { grid-template-columns: repeat(var(--cols, 60), var(--brick-size-tablet)); gap: var(--gap-tablet); }
          .brick {
            width: var(--brick-size-tablet);
            height: var(--brick-height-tablet);
          }
        }

        @media (min-width: 1024px) {
          .course { grid-template-columns: repeat(var(--cols, 60), var(--brick-size-desktop)); gap: var(--gap-desktop); }
          .brick {
            width: var(--brick-size-desktop);
            height: var(--brick-height-desktop);
          }
        }

        @keyframes place {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}),e.jsx("div",{className:"stack",style:{"--cols":a},children:N()}),e.jsx("div",{className:"flex flex-wrap gap-4 text-sm",children:Object.entries(T).map(([r,n])=>e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("div",{className:"w-3 h-3 rounded-sm",style:{backgroundColor:n}}),e.jsx("span",{className:"capitalize text-gray-600",children:r==="followup"?"Follow Up":r==="knowledge"?"Market Knowledge":r})]},r))})]})}const y=s=>Math.min(99,Math.floor(Math.sqrt(s/100))),S=s=>Math.floor(s**2*100),ue=s=>{const t=y(s);return t>=99?0:S(t+1)-s},ge=s=>{const t=y(s);if(t>=99)return 100;const c=S(t),a=S(t+1),l=Math.max(0,s-c),d=Math.max(1,a-c);return Math.floor(l/d*100)},G=s=>s>=99?"text-yellow-500":s>=80?"text-purple-500":s>=60?"text-blue-500":s>=40?"text-green-500":s>=20?"text-orange-500":"text-gray-500";function $({name:s,xp:t,icon:c,description:a,skillKey:l}){const d=y(t),p=ge(t),i=ue(t),m=G(d),k=(()=>{if(i<=0)return"";const v=(x,N)=>Math.ceil(x/N);switch(l){case"prospecting":{const x=v(i,25);return`${x} prospect${x===1?"":"s"} to next level`}case"followUp":{const x=v(i,15),N=v(i,10),r=Math.floor(i/15),n=i-r*15,o=n>0?v(n,10):0,u=`${r} call${r===1?"":"s"}${o?` + ${o} email${o===1?"":"s"}`:""}`;return`${x} call${x===1?"":"s"} or ${N} email${N===1?"":"s"} (e.g., ${u})`}case"consistency":{const x=v(i,100);return`${x} active day${x===1?"":"s"}`}case"marketKnowledge":{const x=v(i,20);return`${x} requirement${x===1?"":"s"}`}}})();return e.jsxs(j,{className:"relative overflow-hidden",children:[e.jsx(E,{className:"pb-3",children:e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("div",{className:"p-2 rounded-lg bg-blue-50",children:e.jsx(c,{className:"h-5 w-5 text-blue-600"})}),e.jsxs("div",{children:[e.jsx(_,{className:"text-lg",children:s}),e.jsx("p",{className:"text-sm text-gray-600",children:a})]})]}),e.jsxs("div",{className:"text-right",children:[e.jsx("div",{className:`text-2xl font-bold ${m}`,children:d}),e.jsxs("div",{className:"text-xs text-gray-500",children:[t.toLocaleString()," XP"]})]})]})}),e.jsx(b,{children:e.jsxs("div",{className:"space-y-2",children:[e.jsxs("div",{className:"flex justify-between text-sm",children:[e.jsxs("span",{children:["Progress to level ",d+1]}),e.jsxs("span",{children:[p,"%"]})]}),e.jsx(H,{value:p,className:"h-2"}),i>0&&e.jsx("div",{className:"text-xs text-gray-600 text-center",children:k})]})}),d>=99&&e.jsx("div",{className:"absolute top-2 right-2",children:e.jsxs(U,{className:"bg-yellow-500 text-white",children:[e.jsx(ae,{className:"h-3 w-3 mr-1"}),"MAX"]})})]})}function he(){const{user:s}=ee(),t=s,{data:c,isLoading:a,error:l}=M({queryKey:["/api/leaderboard"],queryFn:async()=>await(await se("GET","/api/leaderboard")).json(),enabled:!!t,staleTime:3e4,refetchInterval:!1,refetchOnWindowFocus:!1}),d=c?.data||[];return e.jsxs(j,{children:[e.jsx(E,{children:e.jsx("div",{className:"flex items-center justify-between",children:e.jsxs(_,{className:"flex items-center gap-2",children:[e.jsx(C,{className:"h-5 w-5 text-yellow-500"}),"Market Leader"]})})}),e.jsx(b,{children:a?e.jsx("div",{className:"space-y-3",children:Array.from({length:3}).map((p,i)=>e.jsxs("div",{className:"flex items-center space-x-3",children:[e.jsx("div",{className:"w-8 h-8 bg-gray-200 rounded animate-pulse"}),e.jsxs("div",{className:"flex-1 space-y-2",children:[e.jsx("div",{className:"h-4 bg-gray-200 rounded animate-pulse"}),e.jsx("div",{className:"h-3 bg-gray-200 rounded animate-pulse w-2/3"})]})]},i))}):!d||d.length===0?e.jsxs("div",{className:"text-center py-8 text-gray-500",children:[e.jsx(C,{className:"h-12 w-12 mx-auto mb-3 text-gray-300"}),e.jsx("p",{children:"No teammates yet"})]}):e.jsxs("div",{className:"space-y-3",children:[l&&e.jsxs("div",{className:"text-red-500 text-sm p-2 bg-red-50 rounded",children:["Error: ",l.message]}),e.jsxs("div",{className:"grid grid-cols-5 gap-2 text-xs font-medium text-gray-500 pb-2 border-b",children:[e.jsx("div",{children:"Rank"}),e.jsx("div",{className:"col-span-2",children:"User"}),e.jsx("div",{className:"text-center",children:"Level"}),e.jsx("div",{className:"text-center",children:"XP"})]}),d.slice(0,10).map((p,i)=>{const m=p.user_id===t?.id;return e.jsxs("div",{className:`grid grid-cols-5 gap-2 items-center p-2 rounded-lg ${m?"bg-blue-50 border border-blue-200":"hover:bg-gray-50"}`,children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs("span",{className:"text-sm font-medium",children:["#",i+1]}),i===0&&e.jsx(C,{className:"h-4 w-4 text-yellow-500"})]}),e.jsxs("div",{className:"col-span-2",children:[e.jsx("div",{className:"text-sm font-medium truncate",children:p.display_name}),m&&e.jsx(U,{variant:"secondary",className:"text-xs px-1 py-0",children:"You"})]}),e.jsx("div",{className:"text-center",children:e.jsx("span",{className:`text-sm font-bold ${G(p.level_total)}`,children:p.level_total})}),e.jsx("div",{className:"text-center text-xs text-gray-600",children:p.xp_total})]},p.user_id)})]})})]})}function Ce(){const{data:s}=M({queryKey:["/api/skills"]}),{data:t=[]}=M({queryKey:["/api/skill-activities"]}),{data:c=[]}=M({queryKey:["/api/prospects"]}),a=s?y(s.prospecting||0)+y(s.followUp||0)+y(s.consistency||0)+y(s.marketKnowledge||0):0,l=a/4;return e.jsx("div",{className:"min-h-screen bg-gray-50 p-6",children:e.jsxs("div",{className:"max-w-7xl mx-auto",children:[e.jsxs("div",{className:"mb-8",children:[e.jsxs("div",{className:"flex items-center gap-3 mb-4",children:[e.jsx("div",{className:"p-3 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600",children:e.jsx(ie,{className:"h-6 w-6 text-white"})}),e.jsxs("div",{children:[e.jsx("h1",{className:"text-3xl font-bold text-gray-900",children:"Broker Stats"}),e.jsx("p",{className:"text-gray-600",children:"Track your progress and level up your broker skills"})]})]}),e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-4 gap-4 mb-8",children:[e.jsx(j,{children:e.jsx(b,{className:"p-4",children:e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-sm text-gray-600",children:"Total Level"}),e.jsx("p",{className:"text-2xl font-bold text-blue-600",children:a})]}),e.jsx(le,{className:"h-6 w-6 text-blue-500"})]})})}),e.jsx(j,{children:e.jsx(b,{className:"p-4",children:e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-sm text-gray-600",children:"Average Level"}),e.jsx("p",{className:"text-2xl font-bold text-green-600",children:l.toFixed(1)})]}),e.jsx(te,{className:"h-6 w-6 text-green-500"})]})})}),e.jsx(j,{children:e.jsx(b,{className:"p-4",children:e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-sm text-gray-600",children:"Streak Days"}),e.jsx("p",{className:"text-2xl font-bold text-orange-600",children:s?.streakDays||0})]}),e.jsx(I,{className:"h-6 w-6 text-orange-500"})]})})}),e.jsx(j,{children:e.jsx(b,{className:"p-4",children:e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-sm text-gray-600",children:"Assets Tracked"}),e.jsx("p",{className:"text-2xl font-bold text-purple-600",children:c.length})]}),e.jsx(K,{className:"h-6 w-6 text-purple-500"})]})})})]})]}),e.jsxs("div",{className:"grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8",children:[e.jsx("div",{className:"lg:col-span-2",children:e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-6",children:[e.jsx($,{name:"Prospecting",xp:s?.prospecting||0,icon:K,description:"Adding prospects, mapping areas, discovering opportunities",skillKey:"prospecting"}),e.jsx($,{name:"Follow Up",xp:s?.followUp||0,icon:re,description:"Calls, emails, meetings, and consistent communication",skillKey:"followUp"}),e.jsx($,{name:"Consistency",xp:s?.consistency||0,icon:I,description:"Daily activity streaks and regular engagement patterns",skillKey:"consistency"}),e.jsx($,{name:"Market Knowledge",xp:s?.marketKnowledge||0,icon:J,description:"Requirements tracking, market research, and industry insights",skillKey:"marketKnowledge"})]})}),e.jsx("div",{className:"lg:col-span-1",children:e.jsx(he,{})})]}),e.jsxs(j,{children:[e.jsx(E,{children:e.jsx(_,{children:"Progress "})}),e.jsx(b,{children:e.jsx(me,{events:t,unitXp:10})})]})]})})}export{Ce as default};
