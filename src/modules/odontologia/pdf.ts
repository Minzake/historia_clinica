import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { UserOptions } from 'jspdf-autotable'
import type { Clinic } from '../../core/types'
import { conditionInfo,conditions,expandFaces,faceLabel,quadrants,surfacePositions,validateDentalRecord } from './model'
import type { DentitionView,Mark,SavedDentalRecord } from './model'

function tooth(doc:jsPDF,id:number,marks:Mark[],x:number,y:number) {
  const scale=.17,positions=surfacePositions(id)
  doc.setFontSize(6);doc.setTextColor('#333333');doc.text(String(id),x,y-5,{align:'center'})
  const areas:{position:keyof typeof positions;from:number;to:number}[]=[{position:'top',from:225,to:315},{position:'right',from:315,to:405},{position:'bottom',from:45,to:135},{position:'left',from:135,to:225}]
  for(const area of areas){
    const points:number[][]=[]
    for(let angle=area.from;angle<=area.to;angle+=9)points.push([Math.cos(angle*Math.PI/180)*22*scale,Math.sin(angle*Math.PI/180)*22*scale])
    for(let angle=area.to;angle>=area.from;angle-=9)points.push([Math.cos(angle*Math.PI/180)*10*scale,Math.sin(angle*Math.PI/180)*10*scale])
    const face=positions[area.position],mark=marks.find(m=>conditionInfo(m.condition).target==='surface'&&expandFaces(m.faces).includes(face))
    doc.setFillColor(mark?conditionInfo(mark.condition).color:'#ffffff');doc.setDrawColor('#6c786d');doc.setLineWidth(.12)
    doc.lines(points.slice(1).map((p,i)=>[p[0]-points[i][0],p[1]-points[i][1]]),x+points[0][0],y+points[0][1],[1,1],'FD',true)
  }
  const central=marks.find(m=>conditionInfo(m.condition).target==='surface'&&expandFaces(m.faces).includes('center'))
  doc.setFillColor(central?conditionInfo(central.condition).color:'#ffffff');doc.circle(x,y,10*scale,'FD')
  for(const mark of marks.filter(m=>conditionInfo(m.condition).target==='tooth')){
    const c=conditionInfo(mark.condition);doc.setDrawColor(c.color);doc.setTextColor(c.color);doc.setLineWidth(.4)
    if(c.id==='healthy'){doc.line(x-2,y,x-.6,y+1.5);doc.line(x-.6,y+1.5,x+2.3,y-1.8)}
    else if(c.id==='absent'){doc.setFillColor(c.color);doc.circle(x,y,3.5,'F');doc.setDrawColor('#ffffff');doc.line(x-2,y,x+2,y)}
    else if(c.id==='extraction_plan'){doc.line(x-2.7,y-2.7,x+2.7,y+2.7);doc.line(x-2.7,y+2.7,x+2.7,y-2.7)}
    else if(c.id==='endodontic'||c.id==='necrosis')doc.line(x-2,y+2.7,x+2,y-2.7)
    else if(c.id==='prosthesis'||c.id==='prosthesis_plan'){doc.line(x-3,y-.7,x+3,y-.7);doc.line(x-3,y+.7,x+3,y+.7)}
    else {doc.setFontSize(5);doc.text(c.symbol,x,y+.7,{align:'center'})}
  }
}
export async function buildDentalPdf(record:SavedDentalRecord,context:Clinic,views:Readonly<Record<string,DentitionView>>={}) {
  if(record.canExport===false)throw new Error('EXPORT_NOT_ALLOWED')
  if(record.specialtyId!=='odontologia'||record.schemaVersion!==1)throw new Error('UNSUPPORTED_CLINICAL_SCHEMA')
  const invalid=validateDentalRecord(record);if(invalid)throw new Error(invalid)
  const clinic=record.exportContext||context,doc=new jsPDF()
  const table=(options:UserOptions)=>autoTable(doc,{margin:{top:16,bottom:22,left:14,right:14},...options})
  const header=(title:string)=>{doc.setTextColor('#244b35');doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text(title,14,18);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor('#333333');let y=25;for(const line of [clinic.name||'Consultorio',[clinic.address,clinic.phone].filter(Boolean).join(' · '),`${record.patient.fullName} · DNI ${record.patient.dni||'no informado'} · ${record.patient.historyNumber}`]){if(!line)continue;const lines=doc.splitTextToSize(line,180);doc.text(lines,14,y);y+=lines.length*4.5+2}return y+3}
  const initialY=header('Historia odontológica')
  table({startY:initialY,head:[['Ficha inicial','Datos registrados']],body:[['Apertura',record.patient.date],['Nacimiento',record.patient.birthDate||'No informado'],['Contacto',[record.patient.mobile,record.patient.phone].filter(Boolean).join(' · ')],['Motivo de consulta',record.patient.reason],['Alergias',record.patient.allergies],['Medicación',record.patient.medication],['Antecedentes de salud',record.patient.medicalNotes],['Antecedentes odontológicos',record.patient.dentalNotes]],styles:{fontSize:9,cellPadding:3},headStyles:{fillColor:[47,110,84]},columnStyles:{0:{cellWidth:46}}})
  for(const control of record.clinical.odontograms){
    doc.addPage();const baseY=header(`Odontograma · ${control.date}`);doc.setFontSize(8);const author=doc.splitTextToSize(`Registrado por: ${control.authorName||'Sin autor informado'} · Leyenda ${control.legendVersion}. Sin marca: sin evaluar.`,180);doc.text(author,14,baseY)
    const view=views[control.id]||control.view
    const rows=[[quadrants[0],quadrants[1]],[quadrants[2],quadrants[3]],[quadrants[4],quadrants[5]],[quadrants[6],quadrants[7]]].filter(row=>view==='mixed'||(view==='permanent'?row[0].n<5:row[0].n>4))
    const visibleTeeth=new Set(rows.flatMap(row=>row.flatMap(quadrant=>quadrant.ids)))
    const marks=control.marks.filter(mark=>visibleTeeth.has(mark.tooth))
    let y=baseY+author.length*4+17
    for(const row of rows){
      const ids=row.flatMap(q=>q.ids)
      const start=105-(ids.length-1)*5.5
      doc.setFontSize(7);doc.setTextColor('#555555');doc.text(row[0].name.replace(' derecha',' / izquierda'),14,y-10)
      ids.forEach((id,i)=>tooth(doc,id,marks.filter(m=>m.tooth===id),start+i*11,y));y+=23
    }
    let detailsY=y-7
    const usedConditions=new Set(marks.map(mark=>mark.condition))
    const legend=conditions.filter(condition=>usedConditions.has(condition.id))
    if(legend.length){
      table({startY:detailsY,head:[['Leyenda 1','Significado']],body:legend.map(c=>[c.id==='healthy'?'OK':c.id==='absent'?'AUS':c.symbol,c.label]),styles:{fontSize:8,cellPadding:2},headStyles:{fillColor:[47,110,84]},columnStyles:{0:{cellWidth:25}},didParseCell:data=>{if(data.section==='body'&&data.column.index===0)data.cell.styles.textColor=legend[data.row.index].color}})
      detailsY=(doc as unknown as {lastAutoTable:{finalY:number}}).lastAutoTable.finalY+6
    }
    table({startY:detailsY,head:[['Pieza','Registro','Caras','Detalle']],body:marks.map(m=>[String(m.tooth),conditionInfo(m.condition).label,m.faces.map(f=>faceLabel(f,m.tooth)).join(', '),m.note]),styles:{fontSize:8,cellPadding:2},headStyles:{fillColor:[47,110,84]}})
    if(control.notes)table({startY:((doc as unknown as {lastAutoTable:{finalY:number}}).lastAutoTable?.finalY||y)+5,body:[['Observaciones',control.notes]],styles:{fontSize:9,cellPadding:3},columnStyles:{0:{cellWidth:30}}})
  }
  if(record.clinical.treatmentPlan.length){doc.addPage();const y=header('Plan de tratamiento');table({startY:y,head:[['Indicación','Pieza','Procedimiento','Estado','Realización']],body:record.clinical.treatmentPlan.map(t=>[t.date,t.tooth?String(t.tooth):'General',t.description,{pending:'Pendiente',in_progress:'En curso',completed:'Realizado'}[t.status],t.completedDate]),styles:{fontSize:8,cellPadding:3},headStyles:{fillColor:[47,110,84]}})}
  if(record.evolutions.length){doc.addPage();const y=header('Evoluciones odontológicas');table({startY:y,head:[['Fecha','Procedimiento / evaluación']],body:record.evolutions.map(e=>[e.date,e.procedure]),styles:{fontSize:9,cellPadding:3},headStyles:{fillColor:[47,110,84]},columnStyles:{0:{cellWidth:26}}})}
  const pages=doc.getNumberOfPages()
  for(let p=1;p<=pages;p++){doc.setPage(p);doc.setFontSize(7);doc.setTextColor('#666666');doc.text(`${record.patient.historyNumber||'Odontología'} · Versión ${record.version} · ${p} / ${pages}`,14,289);doc.text('Firma y sello del profesional: ____________________',115,289)}
  return doc
}
export async function downloadDentalPdf(record:SavedDentalRecord,clinic:Clinic,views:Readonly<Record<string,DentitionView>>={}) { const doc=await buildDentalPdf(record,clinic,views);doc.save(`Odontologia-${record.patient.historyNumber||record.id}-v${record.version}.pdf`) }
