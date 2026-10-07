import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
const driveUploadUrl = import.meta.env.VITE_GOOGLE_DRIVE_UPLOAD_URL;
const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
const internalAccountDomain = 'bankhuha.local';

function usernameToEmail(usernameOrEmail) {
  const value = usernameOrEmail.trim().toLowerCase();
  return value.includes('@') ? value : `${value}@${internalAccountDomain}`;
}

let auth;
let db;

function withEffectiveRole(account, profile) {
  const isAdminEmail = adminEmails.includes(account.email?.toLowerCase());
  return {
    uid: account.uid,
    ...profile,
    role: isAdminEmail ? 'admin' : profile.role,
    adminPendingVerification: false,
  };
}

if (firebaseReady) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export function watchAuth(callback) {
  if (!firebaseReady) return () => {};
  return onAuthStateChanged(auth, async (account) => {
    if (!account) return callback(null);
    let snapshot = await getDoc(doc(db, 'users', account.uid));
    // การสมัครสมาชิกอาจแจ้ง auth state ก่อนที่ profile จะเขียนลง Firestore เสร็จ
    if (!snapshot.exists()) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      snapshot = await getDoc(doc(db, 'users', account.uid));
    }
    callback(snapshot.exists() ? withEffectiveRole(account, snapshot.data()) : null);
  });
}

export async function registerUser(values) {
  const username = values.username.trim().toLowerCase();
  const internalEmail = usernameToEmail(username);
  const credential = await createUserWithEmailAndPassword(auth, internalEmail, values.password);
  const profile = {
    username,
    email: internalEmail,
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    subject: values.subject.trim(),
    role: values.role,
    status: 'pending',
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'users', credential.user.uid), profile);
  return withEffectiveRole(credential.user, profile);
}

export async function loginUser(usernameOrEmail, password) {
  const credential = await signInWithEmailAndPassword(auth, usernameToEmail(usernameOrEmail), password);
  const snapshot = await getDoc(doc(db, 'users', credential.user.uid));
  if (!snapshot.exists()) throw new Error('ไม่พบข้อมูลสมาชิก');
  return withEffectiveRole(credential.user, snapshot.data());
}

export async function refreshUserProfile() {
  if (!auth?.currentUser) return null;
  await auth.currentUser.getIdToken(true);
  const snapshot = await getDoc(doc(db, 'users', auth.currentUser.uid));
  return snapshot.exists() ? withEffectiveRole(auth.currentUser, snapshot.data()) : null;
}

export function logoutUser() {
  return signOut(auth);
}

export async function uploadLessonPlanToDrive(file) {
  if (!driveUploadUrl) {
    throw new Error('ยังไม่ได้ตั้งค่า Google Drive Upload URL');
  }
  if (!auth?.currentUser) throw new Error('กรุณาเข้าสู่ระบบใหม่');

  const idToken = await auth.currentUser.getIdToken();
  const fileBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์ได้'));
    reader.readAsDataURL(file);
  });

  const requestBody = JSON.stringify({ idToken, fileName: file.name, mimeType: file.type, fileBase64 });
  let result;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await fetch(driveUploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: requestBody,
      redirect: 'follow',
      cache: 'no-store',
    });
    const responseText = await response.text();
    try {
      result = JSON.parse(responseText);
      break;
    } catch {
      if (attempt === 2) {
        throw new Error('บริการอัปโหลดไม่ส่งข้อมูลกลับมาในรูปแบบที่ถูกต้อง กรุณาลองอัปโหลด PDF อีกครั้ง');
      }
    }
  }
  if (!result.ok) throw new Error(result.error || 'อัปโหลดไฟล์ไม่สำเร็จ');
  return {
    uploaded: true,
    provider: 'google_drive',
    fileId: result.fileId,
    fileName: result.fileName,
    fileUrl: result.fileUrl,
    previewUrl: result.previewUrl,
    downloadUrl: result.downloadUrl,
  };
}

export async function saveSupervisionCard(user, values, cardId, existingLessonPlan) {
  const cardRef = cardId ? doc(db, 'supervisions', cardId) : doc(collection(db, 'supervisions'));
  const lessonPlan = values.lessonPlan || existingLessonPlan || null;
  const payload = {
    teacherId: user.uid,
    teacherName: `${user.firstName} ${user.lastName}`,
    subject: values.subject.trim(),
    period: values.period.trim(),
    teachingDate: values.teachingDate,
    classroom: values.classroom.trim(),
    status: lessonPlan ? 'waiting_for_evaluation' : 'draft',
    lessonPlan,
    updatedAt: serverTimestamp(),
  };
  if (cardId) await updateDoc(cardRef, payload);
  else await setDoc(cardRef, { ...payload, createdAt: serverTimestamp() });
  return cardRef.id;
}

export async function deleteSupervisionCard(cardId) {
  await deleteDoc(doc(db, 'supervisions', cardId));
}

export async function requestSupervisionCardDeletion(cardId, user) {
  await updateDoc(doc(db, 'supervisions', cardId), {
    deletionRequest: {
      status: 'pending',
      requestedBy: user.uid,
      requestedByName: `${user.firstName} ${user.lastName}`,
      requestedAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });
}

export async function rejectSupervisionCardDeletion(cardId, user) {
  await updateDoc(doc(db, 'supervisions', cardId), {
    'deletionRequest.status': 'rejected',
    'deletionRequest.reviewedBy': user.uid,
    'deletionRequest.reviewedAt': serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function watchCards(user, callback) {
  const cardsQuery = user.role === 'teacher'
    ? query(collection(db, 'supervisions'), where('teacherId', '==', user.uid))
    : collection(db, 'supervisions');
  return onSnapshot(cardsQuery, (snapshot) => {
    const cards = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    cards.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    callback(cards);
  });
}

export function watchUsers(callback) {
  return onSnapshot(collection(db, 'users'), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ uid: item.id, ...item.data() })));
  });
}

export function watchPlanComments(user, callback) {
  const commentsQuery = user.role === 'teacher'
    ? query(collection(db, 'planComments'), where('teacherId', '==', user.uid))
    : collection(db, 'planComments');
  return onSnapshot(commentsQuery, (snapshot) => {
    const comments = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    comments.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    callback(comments);
  });
}

export async function setUserStatus(uid, status) {
  await updateDoc(doc(db, 'users', uid), { status });
}

export async function completeEvaluation(cardId, user, evaluation, complete) {
  const cardRef = doc(db, 'supervisions', cardId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(cardRef);
    if (!snapshot.exists()) throw new Error('ไม่พบการ์ดนิเทศ');

    const card = snapshot.data();
    const evaluations = card.evaluations || {};
    const legacyEvaluation = card.evaluatorId === user.uid ? card.evaluation : null;
    const previous = evaluations[user.uid] || legacyEvaluation || {};
    const completedNumbers = Object.values(evaluations)
      .filter((item) => item?.completed)
      .map((item) => Number(item.evaluationNumber) || 0);
    if (card.evaluation?.evaluatedAt) completedNumbers.push(1);
    const evaluationNumber = complete
      ? (previous.evaluationNumber || (legacyEvaluation?.evaluatedAt ? 1 : Math.max(0, ...completedNumbers) + 1))
      : (previous.evaluationNumber || null);
    const nextEvaluation = {
      ...previous,
      ...evaluation,
      evaluatorId: user.uid,
      completed: complete || Boolean(previous.completed || previous.evaluatedAt),
      evaluationNumber,
      evaluatedAt: complete ? serverTimestamp() : (previous.evaluatedAt || null),
      updatedAt: serverTimestamp(),
    };
    const hasCompletedEvaluation = complete || Object.values(evaluations).some((item) => item?.completed)
      || Boolean(card.evaluation?.evaluatedAt);

    transaction.update(cardRef, {
      status: hasCompletedEvaluation ? 'completed' : 'evaluating',
      evaluations: { ...evaluations, [user.uid]: nextEvaluation },
      updatedAt: serverTimestamp(),
    });
  });
}

export async function savePlanComment(card, user, comment) {
  await addDoc(collection(db, 'planComments'), {
    cardId: card.id,
    teacherId: card.teacherId,
    authorId: user.uid,
    authorName: `${user.firstName} ${user.lastName}`,
    authorRole: user.role,
    text: comment.trim(),
    createdAt: serverTimestamp(),
  });
}
