import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Save, X } from 'lucide-react';

export const evaluationItems = [
  { id: 1, group: 'ด้านครูผู้สอน', text: 'การจัดกิจกรรมการเรียนรู้ที่ส่งเสริมกระบวนการคิดของนักเรียน' },
  { id: 2, group: 'ด้านครูผู้สอน', text: 'การเปิดโอกาสให้ผู้เรียนได้มีส่วนร่วมในการจัดการเรียนรู้' },
  { id: 3, group: 'ด้านครูผู้สอน', text: 'การจัดกิจกรรมการเรียนรู้ที่ให้นักเรียนลงมือปฏิบัติจริง' },
  { id: 4, group: 'ด้านครูผู้สอน', text: 'การใช้รูปแบบ เทคนิค วิธีการจัดการเรียนรู้ที่ส่งเสริมการเรียนรู้ Active Learning' },
  { id: 5, group: 'ด้านครูผู้สอน', text: 'การเลือกจัดกิจกรรมได้สอดคล้องกับวัตถุประสงค์การจัดการเรียนรู้' },
  { id: 6, group: 'ด้านครูผู้สอน', text: 'การใช้สื่อ นวัตกรรมหรือแหล่งเรียนรู้เหมาะสมกับผู้เรียน' },
  { id: 7, group: 'ด้านครูผู้สอน', text: 'การเสริมแรง ดูแลช่วยเหลือนักเรียนอย่างทั่วถึง' },
  { id: 8, group: 'ด้านครูผู้สอน', text: 'การวัดผลประเมินผลที่สอดคล้องกับตัวชี้วัดการเรียนรู้ทั้งด้านความรู้ ทักษะและคุณลักษณะ' },
  { id: 9, group: 'ด้านครูผู้สอน', text: 'การสรุปและสะท้อนผลการเรียนรู้ต่อนักเรียนภายในช่วงเวลาที่จัดกิจกรรม' },
  { id: 10, group: 'ด้านครูผู้สอน', text: 'การจัดกิจกรรมตามที่กำหนดไว้ในแผนการจัดการเรียนรู้' },
  { id: 11, group: 'ด้านผู้เรียน', text: 'นักเรียนสร้างองค์ความรู้และจัดระบบการเรียนรู้ด้วยตนเอง' },
  { id: 12, group: 'ด้านผู้เรียน', text: 'นักเรียนสามารถสร้างชิ้นงาน ภาระงานบรรลุตามวัตถุประสงค์การจัดการเรียนรู้' },
  { id: 13, group: 'ด้านผู้เรียน', text: 'นักเรียนมีส่วนร่วมในกิจกรรมการเรียนการสอนและมีความกระตือรือร้นในการเรียนรู้' },
  { id: 14, group: 'ด้านผู้เรียน', text: 'นักเรียนมีปฏิสัมพันธ์ที่ดีกับผู้สอนและเพื่อนในชั้นเรียน กล้านำเสนอ แสดงความคิดเห็น และโต้แย้งอย่างมีเหตุผล' },
  { id: 15, group: 'ด้านผู้เรียน', text: 'นักเรียนมีส่วนร่วมแสดงความคิดเห็นจากการประเมินผลงานชิ้นงานของตนเองหรือเพื่อน' },
];

const emptyPhase = { time: '', process: '', observation: '' };

export default function EvaluationForm({ card, evaluator, onClose, onSave }) {
  const previous = card.evaluation || {};
  const [form, setForm] = useState({
    supervisionNumber: previous.supervisionNumber || '',
    supervisionDate: previous.supervisionDate || card.teachingDate || '',
    school: previous.school || 'โรงเรียนบ้านคูหา',
    district: previous.district || 'สะบ้าย้อย',
    teacherPosition: previous.teacherPosition || '',
    academicStanding: previous.academicStanding || 'ไม่มีวิทยฐานะ',
    lessonTopic: previous.lessonTopic || card.subject || '',
    studentCount: previous.studentCount || '',
    teachingExperience: previous.teachingExperience || '',
    evaluatorPosition: previous.evaluatorPosition || '',
    classroomLayout: previous.classroomLayout || '',
    phases: previous.phases || {
      introduction: { ...emptyPhase },
      learning: { ...emptyPhase },
      summary: { ...emptyPhase },
    },
    strengths: previous.strengths || '',
    improvements: previous.improvements || '',
    planComment: previous.planComment || '',
    scores: previous.scores || {},
    suggestions: previous.suggestions || {},
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const ratedCount = Object.values(form.scores).filter((score) => score !== '' && score !== undefined).length;
  const total = useMemo(() => Object.values(form.scores).reduce((sum, score) => sum + Number(score || 0), 0), [form.scores]);
  const setValue = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setPhase = (phase, key, value) => setForm((current) => ({
    ...current,
    phases: { ...current.phases, [phase]: { ...current.phases[phase], [key]: value } },
  }));
  const setScore = (id, value) => setForm((current) => ({ ...current, scores: { ...current.scores, [id]: value } }));
  const setSuggestion = (id, value) => setForm((current) => ({ ...current, suggestions: { ...current.suggestions, [id]: value } }));

  const save = async (complete) => {
    if (complete && ratedCount !== evaluationItems.length) {
      setError(`กรุณาให้คะแนนให้ครบทั้ง ${evaluationItems.length} ข้อ (ขณะนี้ ${ratedCount} ข้อ)`);
      document.getElementById('active-learning-section')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(card.id, {
        ...form,
        totalScore: total,
        maxScore: 45,
        evaluatorName: `${evaluator.firstName} ${evaluator.lastName}`,
        evaluatorEmail: evaluator.email,
      }, complete);
    } catch (err) {
      setError(err?.message || 'บันทึกแบบประเมินไม่สำเร็จ');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-3 sm:p-6">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-slate-50 shadow-2xl">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-8">
          <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><ClipboardCheck /></span><div><p className="text-xs font-bold text-emerald-700">แบบบันทึกการสังเกตการสอนของครู</p><h2 className="font-black">{card.teacherName} · {card.subject}</h2></div></div>
          <button onClick={onClose} className="icon-button"><X /></button>
        </header>

        <div className="space-y-6 p-4 sm:p-8">
          <FormSection number="1" title="ข้อมูลผู้รับการนิเทศและผู้นิเทศ">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <ReadOnly label="ชื่อผู้รับการนิเทศ" value={card.teacherName} />
              <ReadOnly label="กลุ่มสาระ/วิชา" value={card.subject} />
              <ReadOnly label="ระดับชั้น" value={card.classroom} />
              <Input label="โรงเรียน" value={form.school} onChange={(v) => setValue('school', v)} />
              <Input label="อำเภอ" value={form.district} onChange={(v) => setValue('district', v)} />
              <Input label="ตำแหน่งผู้รับการนิเทศ" value={form.teacherPosition} onChange={(v) => setValue('teacherPosition', v)} />
              <Select label="วิทยฐานะ" value={form.academicStanding} onChange={(v) => setValue('academicStanding', v)} options={['ไม่มีวิทยฐานะ', 'ชำนาญการ', 'ชำนาญการพิเศษ']} />
              <Input label="เรื่องที่สอน" value={form.lessonTopic} onChange={(v) => setValue('lessonTopic', v)} />
              <Input label="จำนวนนักเรียนที่เข้าเรียน" type="number" value={form.studentCount} onChange={(v) => setValue('studentCount', v)} />
              <Input label="ประสบการณ์สอน (ปี)" type="number" value={form.teachingExperience} onChange={(v) => setValue('teachingExperience', v)} />
              <Input label="นิเทศครั้งที่" type="number" value={form.supervisionNumber} onChange={(v) => setValue('supervisionNumber', v)} />
              <Input label="วันที่นิเทศ" type="date" value={form.supervisionDate} onChange={(v) => setValue('supervisionDate', v)} />
              <ReadOnly label="ชื่อผู้นิเทศ" value={`${evaluator.firstName} ${evaluator.lastName}`} />
              <Input label="ตำแหน่งผู้นิเทศ" value={form.evaluatorPosition} onChange={(v) => setValue('evaluatorPosition', v)} />
            </div>
            <TextArea label="แผนผังการจัดห้องเรียน (อธิบายเป็นข้อความ)" value={form.classroomLayout} onChange={(v) => setValue('classroomLayout', v)} rows={3} />
          </FormSection>

          <FormSection number="2" title="กระบวนการจัดการเรียนรู้">
            <Phase title="ขั้นเตรียม/ขั้นนำเข้าสู่บทเรียน" data={form.phases.introduction} onChange={(key, value) => setPhase('introduction', key, value)} />
            <Phase title="ขั้นจัดกิจกรรมการเรียนรู้" data={form.phases.learning} onChange={(key, value) => setPhase('learning', key, value)} />
            <Phase title="ขั้นสรุป/วัดและประเมินผล" data={form.phases.summary} onChange={(key, value) => setPhase('summary', key, value)} />
          </FormSection>

          <FormSection number="3" title="สรุปผลการสังเกต">
            <TextArea label="จุดเด่น" value={form.strengths} onChange={(v) => setValue('strengths', v)} rows={5} />
            <TextArea label="จุดควรพัฒนาต่อยอด" value={form.improvements} onChange={(v) => setValue('improvements', v)} rows={5} />
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4"><TextArea label="ความคิดเห็นต่อแผนการสอน (ไม่บังคับ)" value={form.planComment} onChange={(v) => setValue('planComment', v)} rows={4} /></div>
          </FormSection>

          <FormSection number="4" title="แบบประเมินการจัดกิจกรรมการเรียนรู้ Active Learning รายชั่วโมง">
            <div className="mb-5 grid gap-2 rounded-2xl bg-slate-100 p-4 text-xs text-slate-600 sm:grid-cols-4"><span><b>3</b> ครบถ้วน สมบูรณ์</span><span><b>2</b> ครบถ้วน แต่ยังไม่สมบูรณ์</span><span><b>1</b> ยังขาดความครบถ้วน</span><span><b>0</b> ไม่ปฏิบัติ/ไม่มีคุณภาพ</span></div>
            <div id="active-learning-section" className="space-y-3">
              {evaluationItems.map((item, index) => <div key={item.id}>{(index === 0 || evaluationItems[index - 1].group !== item.group) && <h4 className="mb-2 mt-5 font-black text-emerald-800">{item.group}</h4>}<EvaluationRow item={item} score={form.scores[item.id]} suggestion={form.suggestions[item.id]} onScore={(value) => setScore(item.id, value)} onSuggestion={(value) => setSuggestion(item.id, value)} /></div>)}
            </div>
            <div className="mt-6 flex items-center justify-between rounded-2xl bg-slate-900 p-5 text-white"><div><p className="text-xs text-slate-400">ประเมินแล้ว {ratedCount}/15 ข้อ</p><p className="font-bold">คะแนนรวม</p></div><p className="text-3xl font-black text-emerald-300">{total} / 45</p></div>
          </FormSection>

          {error && <p className="rounded-xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</p>}
          <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:justify-end">
            <button disabled={saving} onClick={() => save(false)} className="secondary-button"><Save size={18} /> บันทึกร่าง</button>
            <button disabled={saving} onClick={() => save(true)} className="primary-button"><CheckCircle2 size={18} /> {saving ? 'กำลังบันทึก...' : 'ยืนยันประเมินครบแล้ว'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormSection({ number, title, children }) { return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 font-black text-white">{number}</span><h3 className="text-lg font-black">{title}</h3></div><div className="space-y-4">{children}</div></section>; }
function Input({ label, value, onChange, type = 'text' }) { return <label className="block"><span className="mb-2 block text-xs font-bold text-slate-500">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function Select({ label, value, onChange, options }) { return <label className="block"><span className="mb-2 block text-xs font-bold text-slate-500">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>; }
function ReadOnly({ label, value }) { return <div><span className="mb-2 block text-xs font-bold text-slate-500">{label}</span><div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold">{value || '-'}</div></div>; }
function TextArea({ label, value, onChange, rows }) { return <label className="block"><span className="mb-2 block text-xs font-bold text-slate-500">{label}</span><textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function Phase({ title, data, onChange }) { return <div className="rounded-2xl border border-slate-200 p-4"><h4 className="font-black text-slate-800">{title}</h4><div className="mt-4 grid gap-4 lg:grid-cols-[160px_1fr_1fr]"><Input label="เวลา" value={data.time} onChange={(value) => onChange('time', value)} /><TextArea label="กระบวนการสอน" value={data.process} onChange={(value) => onChange('process', value)} rows={5} /><TextArea label="ข้อสังเกต" value={data.observation} onChange={(value) => onChange('observation', value)} rows={5} /></div></div>; }
function EvaluationRow({ item, score, suggestion, onScore, onSuggestion }) { return <div className="grid gap-3 rounded-2xl border border-slate-200 p-4 lg:grid-cols-[1fr_260px_1fr]"><div className="text-sm font-semibold"><span className="mr-2 text-emerald-700">{item.id}.</span>{item.text}</div><div className="flex gap-2">{[3, 2, 1, 0].map((value) => <label key={value} className={`flex flex-1 cursor-pointer items-center justify-center rounded-xl border px-2 py-2 text-sm font-black ${Number(score) === value && score !== '' && score !== undefined ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}><input className="sr-only" type="radio" name={`score-${item.id}`} checked={Number(score) === value && score !== '' && score !== undefined} onChange={() => onScore(value)} />{value}</label>)}</div><input value={suggestion || ''} onChange={(event) => onSuggestion(event.target.value)} placeholder="ข้อเสนอแนะ (ไม่บังคับ)" /></div>; }
