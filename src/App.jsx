import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Edit3,
  Eye,
  FileText,
  LogOut,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Target,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import {
  completeEvaluation,
  deleteSupervisionCard,
  firebaseReady,
  loginUser,
  logoutUser,
  setUserStatus,
  registerUser,
  rejectSupervisionCardDeletion,
  requestSupervisionCardDeletion,
  saveSupervisionCard,
  savePlanComment,
  uploadLessonPlanToDrive,
  watchAuth,
  watchCards,
  watchPlanComments,
  watchUsers,
} from './firebase';
import EvaluationForm, { evaluationItems } from './EvaluationForm';

const demoTeacher = {
  uid: 'demo-teacher', email: 'local@demo', firstName: 'ผู้ใช้งาน', lastName: 'ระบบ',
  subject: 'คณิตศาสตร์', role: 'teacher', status: 'active',
};
const demoSupervisor = {
  uid: 'demo-supervisor', email: 'supervisor@gmail.com', firstName: 'นิเทศ', lastName: 'การสอน',
  subject: 'วิชาการ', role: 'supervisor', status: 'active',
};

const initialDemoCards = [{
  id: 'demo-card-1', teacherId: demoTeacher.uid, teacherName: 'สมชาย ใจดี',
  subject: 'คณิตศาสตร์', period: '2', teachingDate: '2026-08-12', classroom: 'ม.2/1',
  lessonPlan: { uploaded: true, fileName: 'แผนการสอนคณิตศาสตร์.pdf', fileUrl: '#' },
  status: 'waiting_for_evaluation',
}];

const isTeacherRole = (role) => role === 'teacher' || role === 'teacher_supervisor';
const isEvaluatorRole = (role) => role === 'supervisor' || role === 'teacher_supervisor' || role === 'admin';
const getEvaluationForUser = (card, uid) => card.evaluations?.[uid]
  || (card.evaluatorId === uid ? card.evaluation : null)
  || null;
const getCompletedEvaluations = (card) => {
  const results = Object.values(card.evaluations || {}).filter((item) => item?.completed || item?.evaluatedAt);
  if (card.evaluation?.evaluatedAt && !results.some((item) => item.evaluatorId === card.evaluatorId)) {
    results.push({ ...card.evaluation, evaluatorId: card.evaluatorId, evaluationNumber: 1, completed: true });
  }
  return results.sort((a, b) => (Number(a.evaluationNumber) || 0) - (Number(b.evaluationNumber) || 0));
};
const timestampMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const millis = new Date(value).getTime();
  return Number.isNaN(millis) ? 0 : millis;
};
const getPlanDiscussionComments = (card, comments = []) => {
  const results = [...comments];
  const legacyEvaluations = [card.evaluation, ...Object.values(card.evaluations || {})].filter(Boolean);
  legacyEvaluations.forEach((evaluation, index) => {
    if (!evaluation.planComment?.trim()) return;
    const authorId = evaluation.evaluatorId || evaluation.evaluatorEmail || `legacy-${index}`;
    const duplicate = results.some((comment) => comment.authorId === authorId && comment.text === evaluation.planComment.trim());
    if (!duplicate) results.push({
      id: `legacy-${authorId}-${index}`,
      authorId,
      authorName: evaluation.evaluatorName || 'ผู้นิเทศ',
      authorRole: 'supervisor',
      text: evaluation.planComment.trim(),
      createdAt: evaluation.updatedAt || evaluation.evaluatedAt || null,
    });
  });
  return results.sort((a, b) => timestampMillis(a.createdAt) - timestampMillis(b.createdAt));
};
const evaluationDomains = [
  { name: 'การออกแบบการเรียนรู้', itemIds: [1, 2, 3, 4, 5, 10], advice: 'พัฒนากิจกรรมให้ผู้เรียนคิด มีส่วนร่วม และลงมือปฏิบัติมากขึ้น' },
  { name: 'สื่อและการดูแลผู้เรียน', itemIds: [6, 7], advice: 'เลือกใช้สื่อให้เหมาะกับผู้เรียน และเสริมแรงอย่างทั่วถึง' },
  { name: 'การวัดและสะท้อนผล', itemIds: [8, 9], advice: 'เชื่อมโยงการวัดผลกับตัวชี้วัด และเพิ่มการสรุปสะท้อนผลท้ายคาบ' },
  { name: 'การเรียนรู้และผลงานของผู้เรียน', itemIds: [11, 12], advice: 'เพิ่มโอกาสให้ผู้เรียนสร้างองค์ความรู้และชิ้นงานด้วยตนเอง' },
  { name: 'การมีส่วนร่วมและปฏิสัมพันธ์', itemIds: [13, 14, 15], advice: 'ออกแบบการแลกเปลี่ยนความคิดเห็น การนำเสนอ และการประเมินกันให้มากขึ้น' },
];
const getRoleLabel = (role) => {
  if (role === 'admin') return 'ผู้ดูแลระบบ';
  if (role === 'teacher_supervisor') return 'ครูและผู้นิเทศ';
  if (role === 'supervisor') return 'ผู้นิเทศ';
  return 'ครูผู้สอน';
};

const errorText = (error) => {
  const code = error?.code || '';
  if (code.includes('email-already-in-use')) return 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว';
  if (code.includes('invalid-credential')) return 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
  if (code.includes('weak-password')) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  return error?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
};

function App() {
  const [authPage, setAuthPage] = useState('login');
  const [user, setUser] = useState(firebaseReady ? null : demoTeacher);
  const [authLoading, setAuthLoading] = useState(firebaseReady);
  const [cards, setCards] = useState(initialDemoCards);
  const [editingCard, setEditingCard] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [members, setMembers] = useState([]);
  const [planComments, setPlanComments] = useState([]);
  const [deletingCardId, setDeletingCardId] = useState('');

  useEffect(() => {
    if (!firebaseReady) return;
    return watchAuth((profile) => {
      setUser(profile);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!firebaseReady || !user || (user.role !== 'admin' && user.status !== 'active')) return;
    return watchCards(user, setCards);
  }, [user]);

  useEffect(() => {
    if (!firebaseReady || !user || (user.role !== 'admin' && user.status !== 'active')) return;
    return watchPlanComments(user, setPlanComments);
  }, [user]);

  useEffect(() => {
    if (!firebaseReady || user?.role !== 'admin') return;
    return watchUsers(setMembers);
  }, [user]);

  const handleLogout = async () => {
    if (firebaseReady) await logoutUser();
    setUser(firebaseReady ? null : demoTeacher);
  };

  if (authLoading) return <FullPageMessage text="กำลังตรวจสอบบัญชีผู้ใช้..." />;
  if (!user) {
    return authPage === 'login'
      ? <LoginPage onLogin={setUser} onRegister={() => setAuthPage('register')} />
      : <RegisterPage onRegistered={setUser} onLogin={() => setAuthPage('login')} />;
  }
  if (user.role !== 'admin' && user.status === 'pending') {
    return <PendingApproval user={user} onLogout={handleLogout} />;
  }
  if (user.status === 'suspended') {
    return <FullPageMessage text="บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ" action={<button onClick={handleLogout} className="secondary-button mt-5">ออกจากระบบ</button>} />;
  }

  const saveDemoCard = (values, cardId) => {
    const lessonPlan = values.lessonPlan || editingCard?.lessonPlan || null;
    const payload = {
      teacherId: user.uid,
      teacherName: `${user.firstName} ${user.lastName}`,
      ...values,
      id: cardId || `demo-${Date.now()}`,
      status: lessonPlan ? 'waiting_for_evaluation' : 'draft',
      lessonPlan,
    };
    setCards((current) => cardId
      ? current.map((card) => card.id === cardId ? { ...card, ...payload } : card)
      : [payload, ...current]);
  };

  const handleSaveCard = async (values, file) => {
    let lessonPlan = editingCard?.lessonPlan || null;
    if (file) {
      lessonPlan = firebaseReady
        ? await uploadLessonPlanToDrive(file)
        : {
            uploaded: true,
            provider: 'demo',
            fileName: file.name,
            fileUrl: URL.createObjectURL(file),
            previewUrl: URL.createObjectURL(file),
            downloadUrl: URL.createObjectURL(file),
          };
    }
    const payload = { ...values, lessonPlan };
    if (firebaseReady) await saveSupervisionCard(user, payload, editingCard?.id, editingCard?.lessonPlan);
    else saveDemoCard(payload, editingCard?.id);
    setEditingCard(null);
  };

  const handleEvaluation = async (cardId, evaluation, complete) => {
    if (firebaseReady) await completeEvaluation(cardId, user, evaluation, complete);
    else setCards((current) => current.map((card) => {
      if (card.id !== cardId) return card;
      const evaluations = card.evaluations || {};
      const previous = evaluations[user.uid] || {};
      const completedNumbers = Object.values(evaluations)
        .filter((item) => item?.completed)
        .map((item) => Number(item.evaluationNumber) || 0);
      const evaluationNumber = complete
        ? (previous.evaluationNumber || Math.max(0, ...completedNumbers) + 1)
        : (previous.evaluationNumber || null);
      return {
        ...card,
        status: complete || Object.values(evaluations).some((item) => item?.completed) ? 'completed' : 'evaluating',
        evaluations: {
          ...evaluations,
          [user.uid]: {
            ...previous,
            ...evaluation,
            evaluatorId: user.uid,
            completed: complete || Boolean(previous.completed || previous.evaluatedAt),
            evaluationNumber,
            evaluatedAt: complete ? new Date().toISOString() : (previous.evaluatedAt || null),
          },
        },
      };
    }));
    setDialog(null);
  };

  const handleDeleteCard = async (card) => {
    const isAdminApproval = user.role === 'admin';
    const confirmed = window.confirm(!firebaseReady
      ? `ลบการ์ด “${card.subject}” ของ ${card.teacherName}?\n\nเมื่อลบแล้วจะไม่สามารถกู้คืนการ์ดและผลประเมินได้`
      : isAdminApproval
      ? `อนุมัติให้ลบการ์ด “${card.subject}” ของ ${card.teacherName}?\n\nเมื่อลบแล้วจะไม่สามารถกู้คืนการ์ดและผลประเมินได้`
      : `ส่งคำขอลบการ์ด “${card.subject}” ให้แอดมินอนุมัติ?`);
    if (!confirmed) return;

    setDeletingCardId(card.id);
    try {
      if (firebaseReady) {
        if (isAdminApproval) await deleteSupervisionCard(card.id);
        else await requestSupervisionCardDeletion(card.id, user);
      } else {
        setCards((current) => current.filter((item) => item.id !== card.id));
      }
      if (isAdminApproval && dialog?.card?.id === card.id) setDialog(null);
    } catch (error) {
      window.alert(`${isAdminApproval ? 'ลบการ์ด' : 'ส่งคำขอลบ'}ไม่สำเร็จ: ${errorText(error)}`);
    } finally {
      setDeletingCardId('');
    }
  };

  const handleRejectDeletion = async (card) => {
    if (!window.confirm(`ปฏิเสธคำขอลบการ์ด “${card.subject}” ของ ${card.teacherName}?`)) return;
    setDeletingCardId(card.id);
    try {
      if (firebaseReady) await rejectSupervisionCardDeletion(card.id, user);
      else setCards((current) => current.map((item) => item.id === card.id
        ? { ...item, deletionRequest: { ...item.deletionRequest, status: 'rejected' } }
        : item));
    } catch (error) {
      window.alert(`ดำเนินการไม่สำเร็จ: ${errorText(error)}`);
    } finally {
      setDeletingCardId('');
    }
  };

  if (editingCard !== null) {
    return <CardEditor user={user} card={editingCard || null} onCancel={() => setEditingCard(null)} onSave={handleSaveCard} />;
  }

  return (
    <Dashboard
      user={user}
      cards={cards}
      planComments={planComments}
      onLogout={handleLogout}
      onCreate={() => setEditingCard(false)}
      onEdit={setEditingCard}
      onEvaluate={(card) => setDialog({
        type: 'evaluate',
        card: { ...card, evaluation: getEvaluationForUser(card, user.uid) },
      })}
      onPreview={(card) => setDialog({ type: 'preview', card })}
      onComment={(card) => setDialog({ type: 'comment', card })}
      onPlanComment={(card) => setDialog({ type: 'plan-comment', card })}
      onDelete={handleDeleteCard}
      onRejectDeletion={handleRejectDeletion}
      deletingCardId={deletingCardId}
      members={members}
      onSetStatus={setUserStatus}
    >
      {dialog?.type === 'evaluate' && <EvaluationForm card={dialog.card} evaluator={user} onClose={() => setDialog(null)} onSave={handleEvaluation} />}
      {dialog?.type === 'comment' && <CommentDialog card={dialog.card} onClose={() => setDialog(null)} />}
      {dialog?.type === 'plan-comment' && <PlanCommentDialog card={dialog.card} comments={planComments.filter((comment) => comment.cardId === dialog.card.id)} user={user} onClose={() => setDialog(null)} onSave={async (comment) => {
        if (firebaseReady) await savePlanComment(dialog.card, user, comment);
        else setPlanComments((current) => [...current, {
          id: `demo-comment-${Date.now()}`,
          cardId: dialog.card.id,
          teacherId: dialog.card.teacherId,
          authorId: user.uid,
          authorName: `${user.firstName} ${user.lastName}`,
          authorRole: user.role,
          text: comment.trim(),
          createdAt: new Date(),
        }]);
      }} />}
      {dialog?.type === 'preview' && <PlanPreviewDialog card={dialog.card} onClose={() => setDialog(null)} />}
    </Dashboard>
  );
}

function LoginPage({ onLogin, onRegister }) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (firebaseReady) onLogin(await loginUser(loginId, password));
      else if (loginId.toLowerCase().startsWith('supervisor')) onLogin(demoSupervisor);
      else onLogin(demoTeacher);
    } catch (err) { setError(errorText(err)); }
    finally { setLoading(false); }
  };

  return (
    <AuthShell title="เข้าสู่ระบบ" subtitle="ระบบนิเทศการสอนของครู">
      {!firebaseReady && <DemoNotice />}
      <form className="space-y-4" onSubmit={submit}>
        <Field label="ชื่อผู้ใช้"><input required autoCapitalize="none" value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="เช่น somchai01 (แอดมินใช้อีเมลเดิม)" /></Field>
        <Field label="รหัสผ่าน"><input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="อย่างน้อย 6 ตัวอักษร" /></Field>
        {error && <ErrorBox>{error}</ErrorBox>}
        <button disabled={loading} className="primary-button w-full">{loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}</button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">ยังไม่มีบัญชี? <button onClick={onRegister} className="font-bold text-emerald-700">สมัครสมาชิก</button></p>
    </AuthShell>
  );
}

function RegisterPage({ onRegistered, onLogin }) {
  const [values, setValues] = useState({ username: '', password: '', confirm: '', firstName: '', lastName: '', subject: '', role: 'teacher' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const change = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!/^[a-zA-Z0-9._-]{4,30}$/.test(values.username)) return setError('ชื่อผู้ใช้ต้องมี 4–30 ตัว ใช้ตัวอักษรอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง');
    if (values.password !== values.confirm) return setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
    setLoading(true);
    try {
      if (firebaseReady) onRegistered(await registerUser(values));
      else onRegistered({ uid: `demo-${Date.now()}`, ...values, status: 'active' });
    } catch (err) { setError(errorText(err)); }
    finally { setLoading(false); }
  };
  return (
    <AuthShell title="สมัครสมาชิก" subtitle="สร้างบัญชีครู ผู้นิเทศ หรือครูและผู้นิเทศ">
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ชื่อ"><input required value={values.firstName} onChange={change('firstName')} /></Field>
          <Field label="นามสกุล"><input required value={values.lastName} onChange={change('lastName')} /></Field>
        </div>
        <Field label="วิชาที่สอน"><input required value={values.subject} onChange={change('subject')} placeholder="เช่น คณิตศาสตร์" /></Field>
        <Field label="ประเภทผู้ใช้"><select value={values.role} onChange={change('role')}><option value="teacher">ครู</option><option value="supervisor">ผู้นิเทศ</option><option value="teacher_supervisor">ครูและผู้นิเทศ</option></select></Field>
        <Field label="ชื่อผู้ใช้"><input required minLength={4} maxLength={30} autoCapitalize="none" value={values.username} onChange={change('username')} placeholder="เช่น somchai01" /><span className="mt-1 block text-xs text-slate-500">ใช้อักษรอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง</span></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="รหัสผ่าน"><input type="password" required minLength={6} value={values.password} onChange={change('password')} /></Field>
          <Field label="ยืนยันรหัสผ่าน"><input type="password" required minLength={6} value={values.confirm} onChange={change('confirm')} /></Field>
        </div>
        <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">สมัครแล้วเข้าใช้งานได้ทันที โดยไม่ต้องรอผู้ดูแลระบบอนุมัติ</p>
        {error && <ErrorBox>{error}</ErrorBox>}
        <button disabled={loading} className="primary-button w-full">{loading ? 'กำลังสร้างบัญชี...' : 'สมัครสมาชิก'}</button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600">มีบัญชีแล้ว? <button onClick={onLogin} className="font-bold text-emerald-700">เข้าสู่ระบบ</button></p>
    </AuthShell>
  );
}

function Dashboard({ user, cards, planComments, members, onLogout, onCreate, onEdit, onEvaluate, onPreview, onComment, onPlanComment, onDelete, onRejectDeletion, deletingCardId, onSetStatus, children }) {
  const visibleCards = useMemo(() => user.role === 'teacher' ? cards.filter((card) => card.teacherId === user.uid) : cards, [cards, user]);
  const ownCards = useMemo(() => cards.filter((card) => card.teacherId === user.uid), [cards, user.uid]);
  const canTeach = isTeacherRole(user.role);
  const completed = visibleCards.filter((card) => card.status === 'completed').length;
  const drafts = visibleCards.filter((card) => card.status === 'draft').length;
  const waiting = visibleCards.filter((card) => card.status === 'waiting_for_evaluation').length;
  const evaluating = visibleCards.filter((card) => card.status === 'evaluating').length;
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3"><Logo /><div><h1 className="font-black text-slate-900">ระบบนิเทศการสอน</h1><p className="text-xs text-slate-500">จัดการแผนการสอนและผลการประเมิน</p></div></div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block"><p className="text-sm font-bold">{user.firstName} {user.lastName}</p><p className="text-xs text-slate-500">{getRoleLabel(user.role)}</p></div>
            <button onClick={onLogout} className="icon-button" title="ออกจากระบบ"><LogOut size={19} /></button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {!firebaseReady && <DemoNotice />}
        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="eyebrow">{user.role === 'teacher' ? 'พื้นที่ของครู' : user.role === 'teacher_supervisor' ? 'พื้นที่ของครูและผู้นิเทศ' : 'รายการรอการนิเทศ'}</p><h2 className="mt-1 text-3xl font-black text-slate-900">{user.role === 'teacher' ? 'การ์ดนิเทศของฉัน' : 'การ์ดนิเทศทั้งหมด'}</h2></div>
          {canTeach && <button onClick={onCreate} className="primary-button"><Plus size={19} /> สร้างการ์ดนิเทศ</button>}
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Summary icon={BookOpen} label="การ์ดทั้งหมด" value={visibleCards.length} />
          <Summary icon={FileText} label="ยังไม่แนบแผน" value={drafts} amber />
          <Summary icon={Eye} label="รอประเมิน" value={waiting} />
          <Summary icon={ClipboardCheck} label="กำลังประเมิน" value={evaluating} amber />
          <Summary icon={CheckCircle2} label="ประเมินแล้ว" value={completed} />
        </div>
        {canTeach && <TeacherPerformanceDashboard cards={ownCards} />}
        {user.role === 'admin' && <AdminPanel members={members} currentUser={user} onSetStatus={onSetStatus} />}
        {visibleCards.length ? <div className="mt-7 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">{visibleCards.map((card) => <SupervisionCard key={card.id} card={card} planComments={planComments.filter((comment) => comment.cardId === card.id)} user={user} onEdit={onEdit} onEvaluate={onEvaluate} onPreview={onPreview} onComment={onComment} onPlanComment={onPlanComment} onDelete={onDelete} onRejectDeletion={onRejectDeletion} deleting={deletingCardId === card.id} />)}</div> : <EmptyState onCreate={onCreate} teacher={canTeach} />}
      </main>
      {children}
    </div>
  );
}

function TeacherPerformanceDashboard({ cards }) {
  const completedEvaluations = useMemo(
    () => cards.flatMap((card) => getCompletedEvaluations(card)),
    [cards],
  );
  const summary = useMemo(() => {
    const domainScores = evaluationDomains.map((domain) => {
      const scores = completedEvaluations.flatMap((evaluation) => domain.itemIds
        .map((id) => evaluation.scores?.[id])
        .filter((score) => score !== '' && score !== undefined && score !== null)
        .map(Number));
      const percent = scores.length ? (scores.reduce((sum, score) => sum + score, 0) / (scores.length * 3)) * 100 : null;
      return { ...domain, percent };
    }).filter((domain) => domain.percent !== null);
    const allScores = completedEvaluations.flatMap((evaluation) => Object.values(evaluation.scores || {})
      .filter((score) => score !== '' && score !== undefined && score !== null)
      .map(Number));
    const overall = allScores.length ? (allScores.reduce((sum, score) => sum + score, 0) / (allScores.length * 3)) * 100 : null;
    const sorted = [...domainScores].sort((a, b) => b.percent - a.percent);
    return {
      overall,
      domains: domainScores,
      strongest: sorted[0] || null,
      development: sorted[sorted.length - 1] || null,
      evaluatorCount: new Set(completedEvaluations.map((evaluation) => evaluation.evaluatorId || evaluation.evaluatorEmail).filter(Boolean)).size,
    };
  }, [completedEvaluations]);

  return (
    <section className="mt-7 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="eyebrow">ภาพรวมการพัฒนา</p><h3 className="mt-1 text-xl font-black">สรุปผลการประเมินของฉัน</h3></div>
        {summary.overall !== null && <p className="text-sm text-slate-500">จาก {completedEvaluations.length} ผลประเมิน · {summary.evaluatorCount || '-'} ผู้นิเทศ</p>}
      </div>
      {summary.overall === null ? (
        <div className="mt-5 rounded-2xl border-2 border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">แดชบอร์ดจะแสดงเมื่อมีผลประเมินที่ยืนยันเสร็จแล้ว</div>
      ) : (
        <>
          <div className="mt-5 grid gap-4 lg:grid-cols-[220px_1fr]">
            <div className="flex flex-col justify-center rounded-2xl bg-emerald-50 p-5 text-emerald-900">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><BarChart3 size={22} /></span>
              <p className="mt-4 text-xs font-bold text-emerald-700">คะแนนเฉลี่ยรวม</p>
              <p className="mt-1 text-4xl font-black">{Math.round(summary.overall)}%</p>
            </div>
            <div className="space-y-4 rounded-2xl bg-slate-50 p-5">
              {summary.domains.map((domain) => {
                const percent = Math.round(domain.percent);
                const barClass = percent >= 80 ? 'bg-emerald-500' : percent >= 70 ? 'bg-blue-500' : 'bg-amber-500';
                return <div key={domain.name}><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="font-bold text-slate-700">{domain.name}</span><span className="font-black text-slate-900">{percent}%</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${barClass}`} style={{ width: `${percent}%` }} /></div></div>;
              })}
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><p className="flex items-center gap-2 text-sm font-black text-emerald-800"><BarChart3 size={18} /> ด้านโดดเด่น</p><p className="mt-2 font-black text-emerald-950">{summary.strongest.name} · {Math.round(summary.strongest.percent)}%</p><p className="mt-2 text-sm text-emerald-800">เป็นด้านที่ได้คะแนนเฉลี่ยสูงสุด ควรรักษาและต่อยอด</p></div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><p className="flex items-center gap-2 text-sm font-black text-amber-800"><Target size={18} /> {summary.development.percent >= 80 ? 'ด้านที่ควรต่อยอด' : 'ด้านที่ควรพัฒนา'}</p><p className="mt-2 font-black text-amber-950">{summary.development.name} · {Math.round(summary.development.percent)}%</p><p className="mt-2 text-sm text-amber-900">{summary.development.percent >= 80 ? 'คะแนนอยู่ในระดับดี ให้รักษามาตรฐานและต่อยอด' : summary.development.advice}</p></div>
          </div>
        </>
      )}
    </section>
  );
}

function SupervisionCard({ card, planComments, user, onEdit, onEvaluate, onPreview, onComment, onPlanComment, onDelete, onRejectDeletion, deleting }) {
  const completedEvaluations = getCompletedEvaluations(card);
  const ownEvaluation = getEvaluationForUser(card, user.uid);
  const ownEvaluationCompleted = Boolean(ownEvaluation?.completed || ownEvaluation?.evaluatedAt);
  const done = completedEvaluations.length > 0;
  const evaluating = card.status === 'evaluating';
  const hasPlan = Boolean(card.lessonPlan?.uploaded);
  const owner = card.teacherId === user.uid;
  const evaluator = isEvaluatorRole(user.role);
  const commentCount = getPlanDiscussionComments(card, planComments).length;
  const editableByOwner = owner && ['draft', 'waiting_for_evaluation'].includes(card.status);
  const deletionPending = card.deletionRequest?.status === 'pending';
  const canRequestDeletion = owner && !deletionPending;
  const canReviewDeletion = user.role === 'admin' && deletionPending;
  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className={`h-2 ${done ? 'bg-emerald-500' : evaluating ? 'bg-indigo-500' : hasPlan ? 'bg-amber-400' : 'bg-slate-300'}`} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-bold text-slate-500">{card.teacherName}</p><h3 className="mt-1 text-xl font-black text-slate-900">{card.subject}</h3></div>
          <StatusBadge status={card.status} />
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <Info label="คาบที่" value={card.period} /><Info label="ห้องเรียน" value={card.classroom || '-'} />
          <Info label="วันที่สอน" value={card.teachingDate || '-'} wide />
        </dl>
        <div className={`mt-4 flex items-center gap-3 rounded-2xl p-3 ${hasPlan ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
          <FileText size={20} /><div className="min-w-0"><p className="text-xs font-bold">{hasPlan ? 'แนบแผนการสอนแล้ว' : 'ยังไม่แนบแผนการสอน'}</p>{hasPlan && <p className="truncate text-xs opacity-75">{card.lessonPlan.fileName}</p>}</div>
        </div>
        {deletionPending && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">รอแอดมินอนุมัติการลบ{user.role === 'admin' && card.deletionRequest.requestedByName ? ` · ขอโดย ${card.deletionRequest.requestedByName}` : ''}</div>}
        <div className="mt-5 flex flex-wrap gap-2">
          {editableByOwner && <button onClick={() => onEdit(card)} className="secondary-button"><Edit3 size={17} /> {hasPlan ? 'แก้ไข' : 'แนบแผน PDF'}</button>}
          {hasPlan && <button onClick={() => onPreview(card)} className="secondary-button"><Eye size={17} /> แผนการสอน</button>}
          {evaluator && hasPlan && <button onClick={() => onPlanComment(card)} className="secondary-button"><MessageSquareText size={17} /> คอมเมนต์แผน{commentCount ? ` (${commentCount})` : ''}</button>}
          {evaluator && hasPlan && <button onClick={() => onEvaluate(card)} className={`compact inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white ${ownEvaluationCompleted ? 'bg-emerald-600 hover:bg-emerald-700' : ownEvaluation ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-amber-500 hover:bg-amber-600'}`}><ClipboardCheck size={17} /> {ownEvaluationCompleted ? 'แก้ไขผลประเมินของฉัน' : ownEvaluation ? 'ประเมินต่อ' : 'เริ่มประเมิน'}</button>}
          {completedEvaluations.map((evaluation, index) => (
            <button key={evaluation.evaluatorId || index} onClick={() => onComment({ ...card, evaluation })} className="primary-button compact" title={evaluation.evaluatorName ? `ผู้นิเทศ: ${evaluation.evaluatorName}` : ''}><MessageSquareText size={17} /> ผลประเมินคนที่ {evaluation.evaluationNumber || index + 1}</button>
          ))}
          {owner && !evaluator && commentCount > 0 && <button onClick={() => onPlanComment(card)} className="secondary-button"><MessageSquareText size={17} /> ความคิดเห็นต่อแผน ({commentCount})</button>}
          {canRequestDeletion && <button disabled={deleting} onClick={() => onDelete(card)} className="compact inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"><Trash2 size={17} /> {deleting ? 'กำลังส่งคำขอ...' : 'ขอลบการ์ด'}</button>}
          {canReviewDeletion && <button disabled={deleting} onClick={() => onDelete(card)} className="compact inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"><Trash2 size={17} /> {deleting ? 'กำลังดำเนินการ...' : 'อนุมัติการลบ'}</button>}
          {canReviewDeletion && <button disabled={deleting} onClick={() => onRejectDeletion(card)} className="secondary-button">ปฏิเสธ</button>}
        </div>
      </div>
    </article>
  );
}

function AdminPanel({ members, currentUser, onSetStatus }) {
  const [busyUid, setBusyUid] = useState('');
  const changeStatus = async (uid, status) => {
    setBusyUid(uid);
    try { await onSetStatus(uid, status); } finally { setBusyUid(''); }
  };
  return (
    <section className="mt-7 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between"><div><p className="eyebrow">ผู้ดูแลระบบ</p><h3 className="mt-1 text-xl font-black">จัดการสมาชิก</h3></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{members.length} บัญชี</span></div>
      <div className="mt-4 divide-y divide-slate-100">
        {members.map((member) => {
          const isSelf = member.uid === currentUser.uid;
          const isAdminAccount = isSelf && currentUser.role === 'admin';
          const roleLabel = isAdminAccount ? 'ผู้ดูแลระบบ' : getRoleLabel(member.role);
          const statusLabel = isAdminAccount ? 'สิทธิ์แอดมิน' : member.status === 'active' ? 'ใช้งานอยู่' : member.status === 'pending' ? 'รออนุมัติ' : 'ระงับ';
          const statusClass = isAdminAccount || member.status === 'active'
            ? 'bg-emerald-100 text-emerald-700'
            : member.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700';
          return (
            <div key={member.uid} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold">{member.firstName} {member.lastName}</p>
                <p className="text-xs text-slate-500">{member.username ? `@${member.username}` : member.email} · {roleLabel}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass}`}>{statusLabel}</span>
                {!isSelf && member.status !== 'active' && <button disabled={busyUid === member.uid} onClick={() => changeStatus(member.uid, 'active')} className="primary-button compact">อนุมัติ/เปิดใช้</button>}
                {!isSelf && member.status === 'active' && <button disabled={busyUid === member.uid} onClick={() => changeStatus(member.uid, 'suspended')} className="secondary-button">ระงับ</button>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CardEditor({ user, card, onCancel, onSave }) {
  const [values, setValues] = useState({
    subject: card?.subject || user.subject || '',
    period: card?.period || '',
    teachingDate: card?.teachingDate || '',
    classroom: card?.classroom || '',
  });
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const change = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const acceptFile = async (chosen) => {
    if (!chosen) return;
    if (chosen.type !== 'application/pdf' || chosen.size > 10 * 1024 * 1024) {
      setError('รองรับเฉพาะไฟล์ PDF ขนาดไม่เกิน 10 MB');
      return;
    }
    const contents = new TextDecoder('latin1').decode(await chosen.arrayBuffer());
    if (/\/Encrypt\b/.test(contents)) {
      setFile(null);
      setError('ไฟล์ PDF นี้ตั้งรหัสผ่านไว้ กรุณาปลดรหัสผ่านแล้วบันทึกเป็นไฟล์ใหม่ก่อนอัปโหลด เพื่อให้ผู้นิเทศเปิดดูได้');
      return;
    }
    setFile(chosen);
    setError('');
  };
  const submit = async (event) => {
    event.preventDefault();
    setLoading(true); setError('');
    try { await onSave(values, file); } catch (err) { setError(errorText(err)); setLoading(false); }
  };
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <button onClick={onCancel} className="mb-5 text-sm font-bold text-slate-600">← กลับหน้าการ์ด</button>
        <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="eyebrow">ข้อมูลการนิเทศ · เวอร์ชันบันทึกก่อน แนบ PDF ภายหลัง</p><h1 className="mt-2 text-3xl font-black">{card ? 'แก้ไขการ์ดนิเทศ' : 'สร้างการ์ดนิเทศ'}</h1>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <Field label="วิชาที่จะสอน"><input required value={values.subject} onChange={change('subject')} /></Field>
            <Field label="คาบที่"><input required value={values.period} onChange={change('period')} placeholder="เช่น 2" /></Field>
            <Field label="วันที่สอน"><input type="date" required value={values.teachingDate} onChange={change('teachingDate')} /></Field>
            <Field label="ห้องเรียน / ระดับชั้น"><input required value={values.classroom} onChange={change('classroom')} placeholder="เช่น ม.2/1" /></Field>
          </div>
          <section
            className={`mt-7 rounded-3xl border-2 border-dashed p-6 text-center transition ${dragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50'}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFile(event.dataTransfer.files?.[0]); }}
          >
            <Upload className="mx-auto text-emerald-600" size={38} />
            <h2 className="mt-3 font-black">ลากแผนการสอน PDF มาวางที่นี่</h2>
            <p className="mt-1 text-xs text-slate-500">หรือกดเลือกไฟล์ PDF ขนาดไม่เกิน 10 MB และต้องไม่ตั้งรหัสผ่าน</p>
            <input id="lesson-plan-file" className="hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => acceptFile(event.target.files?.[0])} />
            <label htmlFor="lesson-plan-file" className="secondary-button mt-4 cursor-pointer"><Upload size={17} /> เลือกไฟล์ PDF</label>
            {(file || card?.lessonPlan) && <div className="mx-auto mt-4 flex max-w-md items-center justify-center gap-2 rounded-xl bg-emerald-100 px-4 py-3 text-sm font-bold text-emerald-800"><CheckCircle2 size={18} /> {file ? file.name : card.lessonPlan.fileName}</div>}
            {!file && !card?.lessonPlan && <p className="mt-4 text-xs font-semibold text-amber-700">ยังไม่แนบตอนนี้ก็ได้ ระบบจะบันทึกการ์ดไว้ให้กลับมาแนบภายหลัง</p>}
          </section>
          {error && <div className="mt-5"><ErrorBox>{error}</ErrorBox></div>}
          <div className="mt-7 flex gap-3"><button disabled={loading} className="primary-button">{loading ? (file ? 'กำลังอัปโหลดและบันทึก...' : 'กำลังบันทึก...') : 'บันทึกการ์ด'}</button><button type="button" onClick={onCancel} className="secondary-button">ยกเลิก</button></div>
        </form>
      </div>
    </div>
  );
}

function PlanPreviewDialog({ card, onClose }) {
  const plan = card.lessonPlan;
  const previewUrl = plan?.previewUrl || plan?.fileUrl?.replace(/\/view(?:\?.*)?$/, '/preview');
  const downloadUrl = plan?.downloadUrl || plan?.fileUrl;
  return (
    <Modal onClose={onClose} wide>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="eyebrow">พรีวิวแผนการสอน</p><h2 className="mt-1 pr-10 text-xl font-black">{plan?.fileName}</h2></div>
        {downloadUrl && <a href={downloadUrl} target="_blank" rel="noreferrer" className="secondary-button"><Download size={17} /> ดาวน์โหลด PDF</a>}
      </div>
      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        <iframe title={`แผนการสอน ${card.subject}`} src={previewUrl} className="h-[70vh] w-full" allow="autoplay" />
      </div>
    </Modal>
  );
}

function PlanCommentDialog({ card, comments, user, onClose, onSave }) {
  const canComment = isEvaluatorRole(user.role);
  const discussionComments = getPlanDiscussionComments(card, comments);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!comment.trim()) return setError('กรุณาพิมพ์ความคิดเห็นต่อแผนการสอน');
    setSaving(true); setError('');
    try { await onSave(comment); setComment(''); setSaving(false); } catch (err) { setError(errorText(err)); setSaving(false); }
  };
  return (
    <Modal onClose={onClose}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700"><MessageSquareText /></div>
      <p className="eyebrow mt-5">ความคิดเห็นต่อแผนการสอน</p>
      <h2 className="mt-1 pr-8 text-2xl font-black">{card.teacherName} · {card.subject}</h2>
      <div className="mt-5 flex items-center justify-between"><p className="text-sm font-black text-slate-700">คอมเมนต์ทั้งหมด</p><span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">{discussionComments.length} ความคิดเห็น</span></div>
      <div className="mt-3 max-h-80 space-y-4 overflow-y-auto rounded-2xl bg-slate-50 p-4">
        {discussionComments.length ? discussionComments.map((item) => {
          const roleLabel = item.authorRole === 'teacher_supervisor' ? 'ครูและผู้นิเทศ' : item.authorRole === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้นิเทศ';
          const initial = item.authorName?.trim()?.charAt(0) || 'น';
          const date = timestampMillis(item.createdAt) ? new Date(timestampMillis(item.createdAt)).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '';
          return <div key={item.id} className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 font-black text-white">{initial}</span><div className="min-w-0 flex-1"><div className="rounded-2xl bg-white px-4 py-3 shadow-sm"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-black text-slate-900">{item.authorName}</p><p className="text-[11px] text-slate-400">{date}</p></div><p className="text-xs font-bold text-blue-600">{roleLabel}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{item.text}</p></div></div></div>;
        }) : <div className="py-8 text-center"><MessageSquareText className="mx-auto text-slate-300" size={32} /><p className="mt-3 text-sm text-slate-500">ยังไม่มีความคิดเห็นต่อแผนการสอน</p></div>}
      </div>
      {canComment && <div className="mt-4 rounded-2xl border border-slate-200 p-3"><textarea rows={3} value={comment} maxLength={2000} onChange={(event) => setComment(event.target.value)} placeholder="เขียนความคิดเห็นเกี่ยวกับแผนการสอน..." /><div className="mt-2 flex items-center justify-between"><span className="text-xs text-slate-400">{comment.length}/2000</span><button disabled={saving || !comment.trim()} onClick={submit} className="primary-button compact"><MessageSquareText size={17} /> {saving ? 'กำลังส่ง...' : 'ส่งคอมเมนต์'}</button></div></div>}
      {error && <div className="mt-4"><ErrorBox>{error}</ErrorBox></div>}
      <div className="mt-5 flex justify-end">
        <button onClick={onClose} className="secondary-button">ปิด</button>
      </div>
    </Modal>
  );
}

function CommentDialog({ card, onClose }) {
  const evaluation = card.evaluation || {};
  const phases = evaluation.phases || {};
  return (
    <Modal onClose={onClose} wide>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><MessageSquareText /></div>
        <div><p className="eyebrow">ผลการประเมินฉบับเต็ม</p><h2 className="text-2xl font-black">{card.teacherName} · {card.subject}</h2></div>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 p-5">
        <h3 className="font-black text-emerald-800">ข้อมูลการนิเทศ</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ResultInfo label="โรงเรียน" value={evaluation.school} />
          <ResultInfo label="อำเภอ" value={evaluation.district} />
          <ResultInfo label="ระดับชั้น" value={card.classroom} />
          <ResultInfo label="เรื่องที่สอน" value={evaluation.lessonTopic || card.subject} />
          <ResultInfo label="ตำแหน่งผู้รับการนิเทศ" value={evaluation.teacherPosition} />
          <ResultInfo label="วิทยฐานะ" value={evaluation.academicStanding} />
          <ResultInfo label="จำนวนนักเรียน" value={evaluation.studentCount} />
          <ResultInfo label="ประสบการณ์สอน (ปี)" value={evaluation.teachingExperience} />
          <ResultInfo label="นิเทศครั้งที่" value={evaluation.supervisionNumber} />
          <ResultInfo label="วันที่นิเทศ" value={evaluation.supervisionDate} />
          <ResultInfo label="ชื่อผู้นิเทศ" value={evaluation.evaluatorName} />
          <ResultInfo label="ตำแหน่งผู้นิเทศ" value={evaluation.evaluatorPosition} />
        </div>
        <ResultBlock title="แผนผังการจัดห้องเรียน" value={evaluation.classroomLayout} />
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 p-5">
        <h3 className="font-black text-emerald-800">กระบวนการจัดการเรียนรู้และข้อสังเกต</h3>
        <div className="mt-4 space-y-4">
          <PhaseResult title="ขั้นเตรียม/ขั้นนำเข้าสู่บทเรียน" data={phases.introduction} />
          <PhaseResult title="ขั้นจัดกิจกรรมการเรียนรู้" data={phases.learning} />
          <PhaseResult title="ขั้นสรุป/วัดและประเมินผล" data={phases.summary} />
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 p-5">
        <div className="flex items-end justify-between gap-3"><h3 className="font-black text-emerald-800">สรุปผลการสังเกต</h3><span className="text-2xl font-black text-emerald-700">{evaluation.totalScore ?? '-'} / 45</span></div>
        <ResultBlock title="จุดเด่น" value={evaluation.strengths} />
        <ResultBlock title="จุดควรพัฒนาต่อยอด" value={evaluation.improvements} />
        <ResultBlock title="ความคิดเห็นต่อแผนการสอน" value={evaluation.planComment} blue />
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 p-5">
        <h3 className="font-black text-emerald-800">คะแนน Active Learning รายข้อ</h3>
        <div className="mt-4 space-y-3">
          {evaluationItems.map((item) => (
            <div key={item.id} className="grid gap-2 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr_90px]">
              <div><p className="text-sm font-semibold"><span className="mr-2 text-emerald-700">{item.id}.</span>{item.text}</p>{evaluation.suggestions?.[item.id] && <p className="mt-2 text-xs text-blue-700">ข้อเสนอแนะ: {evaluation.suggestions[item.id]}</p>}</div>
              <div className="self-center rounded-xl bg-emerald-100 px-3 py-2 text-center font-black text-emerald-800">{evaluation.scores?.[item.id] ?? '-'} / 3</div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 flex justify-end"><button onClick={onClose} className="primary-button">ปิดผลการประเมิน</button></div>
    </Modal>
  );
}

function ResultBlock({ title, value, blue }) { return <div className={`mt-4 rounded-2xl p-4 ${blue ? 'bg-blue-50 text-blue-900' : 'bg-slate-50 text-slate-700'}`}><p className="mb-1 text-xs font-black">{title}</p><p className="whitespace-pre-wrap text-sm">{value || 'ไม่มีความคิดเห็นเพิ่มเติม'}</p></div>; }
function ResultInfo({ label, value }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-bold">{value || '-'}</p></div>; }
function PhaseResult({ title, data = {} }) { return <div className="rounded-xl bg-slate-50 p-4"><h4 className="font-bold">{title}</h4><div className="mt-3 grid gap-3 lg:grid-cols-[140px_1fr_1fr]"><ResultInfo label="เวลา" value={data.time} /><ResultInfo label="กระบวนการสอน" value={data.process} /><ResultInfo label="ข้อสังเกต" value={data.observation} /></div></div>; }

function Modal({ children, onClose, wide = false }) { return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4"><div className={`relative mx-auto my-4 w-full rounded-3xl bg-white p-6 shadow-2xl sm:p-8 ${wide ? 'max-w-6xl' : 'max-w-lg'}`}><button onClick={onClose} className="absolute right-5 top-5 z-10 text-slate-400"><X /></button>{children}</div></div>; }
function AuthShell({ title, subtitle, children }) { return <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-slate-100 px-4 py-10"><section className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl sm:p-9"><div className="mb-7 text-center"><Logo large /><h1 className="mt-5 text-3xl font-black">{title}</h1><p className="mt-2 text-sm text-slate-500">{subtitle}</p></div>{children}</section></main>; }
function Logo({ large }) { return <span className={`inline-flex items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-200 ${large ? 'h-16 w-16' : 'h-11 w-11'}`}><ClipboardCheck size={large ? 32 : 23} /></span>; }
function Field({ label, children }) { return <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>{children}</label>; }
function ErrorBox({ children }) { return <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{children}</p>; }
function DemoNotice() { return <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800"><strong>โหมดใช้งานฟรี:</strong> สมัครแล้วเข้าใช้ได้ทันที หรือใช้ชื่อผู้ใช้ใดก็ได้เพื่อเข้าฝั่งครู และใช้ชื่อที่ขึ้นต้นด้วย supervisor เพื่อเข้าฝั่งผู้นิเทศ ข้อมูลจะไม่ถูกส่งไปยัง Firebase</div>; }
function StatusBadge({ status }) {
  const styles = status === 'completed' ? 'bg-emerald-100 text-emerald-700' : status === 'evaluating' ? 'bg-indigo-100 text-indigo-700' : status === 'draft' ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-700';
  const label = status === 'completed' ? 'ประเมินแล้ว' : status === 'evaluating' ? 'กำลังประเมิน' : status === 'draft' ? 'ยังไม่แนบแผน' : 'รอประเมิน';
  return <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${styles}`}>{label}</span>;
}
function Info({ label, value, wide }) { return <div className={`rounded-xl bg-slate-50 p-3 ${wide ? 'col-span-2' : ''}`}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-bold text-slate-800">{value}</dd></div>; }
function Summary({ icon: Icon, label, value, amber }) { return <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4"><span className={`flex h-11 w-11 items-center justify-center rounded-xl ${amber ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}><Icon size={21} /></span><div><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-black">{value}</p></div></div>; }
function EmptyState({ teacher, onCreate }) { return <div className="mt-8 rounded-3xl border-2 border-dashed border-slate-200 bg-white py-16 text-center"><UserRound className="mx-auto text-slate-300" size={42} /><h3 className="mt-4 text-lg font-black">ยังไม่มีการ์ดนิเทศ</h3>{teacher && <button onClick={onCreate} className="primary-button mx-auto mt-5"><Plus size={18} /> สร้างการ์ดแรก</button>}</div>; }
function AdminVerification({ user, onRefresh, onLogout }) { return <FullPageMessage icon={ShieldCheck} text={`ส่งลิงก์ยืนยันผู้ดูแลระบบไปที่ ${user.email} แล้ว กรุณายืนยันอีเมลก่อนใช้งานสิทธิ์แอดมิน`} action={<div className="mt-5 flex gap-3"><button onClick={onRefresh} className="primary-button">ตรวจสอบอีกครั้ง</button><button onClick={onLogout} className="secondary-button">ออกจากระบบ</button></div>} />; }
function PendingApproval({ user, onLogout }) { return <FullPageMessage icon={ShieldCheck} text={`บัญชี ${user.firstName} กำลังรอผู้ดูแลระบบอนุมัติ`} action={<button onClick={onLogout} className="secondary-button mt-5">ออกจากระบบ</button>} />; }
function FullPageMessage({ text, icon: Icon = ClipboardCheck, action }) { return <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center"><Icon className="text-emerald-600" size={44} /><p className="mt-5 max-w-md text-lg font-bold">{text}</p>{action}</div>; }

export default App;
