/* ==================================================
   FIREBASE IMPORTS
================================================== */

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    updateProfile,
    signInWithEmailAndPassword,
    signOut,
    sendEmailVerification,
    reload,
    getIdTokenResult,
    deleteUser
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import {
    getDatabase,
    ref,
    get,
    onValue,
    push,
    set,
    update,
    remove,
    query,
    orderByChild,
    equalTo,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";


/* ==================================================
   FIREBASE CONFIG
================================================== */

const firebaseConfig = {
    apiKey: "AIzaSyD8V935Mr37Y50pc74_OdBh4jH-K6XxNeE",
    authDomain: "tuklask-14f31.firebaseapp.com",
    databaseURL: "https://tuklask-14f31-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "tuklask-14f31",
    storageBucket: "tuklask-14f31.firebasestorage.app",
    messagingSenderId: "358803601517",
    appId: "1:358803601517:web:e7700a047079344d1f2764",
    measurementId: "G-6DMSYZ9XL2"
};


/* ==================================================
   FIREBASE INITIALIZATION
================================================== */

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const database = getDatabase(firebaseApp);


/* ==================================================
   APPLICATION STATE
================================================== */

let currentUser = null;
let currentRole = null;
let students = [];
let generalKnowledgeStudents = [];
let learningBasedStudents = [];
let unsubscribeUsers = null;
let unsubscribeOwnedRooms = null;
let unsubscribeAdminRoomUsers = [];
let unsubscribeAdminGeneralUsers = [];
let adminRoomStudentGroups = new Map();
let adminGeneralStudentGroups = new Map();
let ownedRoomKeys = [];
let ownedRooms = [];
let questions = [];
let editingQuestionId = null;
let unsubscribeQuestions = null;
let unsubscribeStudentRoom = null;
let currentRoomMembership = null;
let studentRoomHistory = [];
let selectedStudentRoomKey = "";
let studentLearningLeaderboard = [];
let studentLearningLeaderboardsByRoom = new Map();
let studentRoomDetails = new Map();
let studentRoomHistoryLoadId = 0;
let studentRoomHistoryDiscoveryLimited = false;
let activeRoomKey = "";
let pendingCsvQuestions = [];
let pendingCsvErrors = [];
let pendingCsvRoomKey = "";


/* ==================================================
   BASIC HELPERS
================================================== */

function showPage(pageId) {
    document.querySelectorAll(".page").forEach(page => {
        page.classList.remove("active");
    });

    document.getElementById(pageId).classList.add("active");

    window.scrollTo(0, 0);
}


function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function formatNumber(value) {
    return Number(value || 0).toLocaleString();
}


function normalizeStudent(uid, user) {
    return {
        uid,
        recordType: "general",

        email: user?.email || "",

        nickname:
            user?.nickname || "Unknown Player",

        studentNumber:
            String(user?.studentNumber || ""),

        yearSection:
            user?.yearSection || "N/A",

        roomKey: String(
            user?.roomKey || ""
        ).toUpperCase(),

        progress: {
            currentStage:
                Number(user?.progress?.currentStage) || 0,

            exp:
                Number(user?.progress?.exp) || 0,

            level:
                Number(user?.progress?.level) || 0
        },

        statistics: {
            correctAnswers:
                Number(user?.statistics?.correctAnswers) || 0,

            wrongAnswers:
                Number(user?.statistics?.wrongAnswers) || 0
        }
    };
}


/* ==================================================
   GLOBAL RANKING
================================================== */

function calculateGlobalRanking(list) {
    return [...list]
        .sort((a, b) => {
            if (b.progress.exp !== a.progress.exp) {
                return b.progress.exp - a.progress.exp;
            }

            if (b.progress.level !== a.progress.level) {
                return b.progress.level - a.progress.level;
            }

            if (
                b.progress.currentStage !==
                a.progress.currentStage
            ) {
                return (
                    b.progress.currentStage -
                    a.progress.currentStage
                );
            }

            return a.nickname.localeCompare(b.nickname);
        })
        .map((student, index) => ({
            ...student,
            rank: index + 1
        }));
}


/* ==================================================
   STAGES COMPLETED
================================================== */

function getStagesCompleted(student) {
    if (Number.isFinite(student.monstersDefeated)) {
        return student.monstersDefeated;
    }


    return Math.max(
        Number(student.progress.currentStage) - 1,
        0
    );
}


/* ==================================================
   QUIZ ACCURACY
================================================== */

function calculateAccuracy(student) {
    const correct =
        student.statistics.correctAnswers;

    const wrong =
        student.statistics.wrongAnswers;

    const total = correct + wrong;

    if (total === 0) {
        return 0;
    }

    return Math.round(
        (correct / total) * 100
    );
}


function normalizeRoomMember(uid, roomKey, member) {
    const progress = member?.progress || {};
    const result = member?.result || {};
    const monstersDefeated = [
        progress.monster1Defeated,
        progress.monster2Defeated,
        progress.monster3Defeated
    ].filter(Boolean).length;
    const correct = Number(
        result.correct ?? progress.correct ?? 0
    );
    const wrong = Number(
        result.wrong ?? progress.wrong ?? 0
    );
    const currentStage = Number(
        progress.currentStage ??
        (member?.status === "completed"
            ? 3
            : monstersDefeated + 1)
    );


    return {
        uid,
        recordType: "learning",
        membershipId: `${roomKey}:${uid}`,
        email: "",
        fullName: String(member?.fullName || ""),
        nickname: String(
            member?.nickname ||
            member?.fullName ||
            "Unknown Player"
        ),
        studentNumber: String(
            member?.studentNumber || ""
        ),
        yearSection: [
            member?.yearLevel,
            member?.section
        ].filter(Boolean).join(" / ") || "N/A",
        roomKey: normalizeRoomKey(
            member?.roomKey || roomKey
        ),
        teacherName: String(member?.teacherName || ""),
        yearLevel: String(member?.yearLevel || ""),
        section: String(member?.section || ""),
        status: String(
            member?.status || "in_progress"
        ),
        joinedAt: Number(member?.joinedAt || 0),
        completedAt: Number(result.completedAt || 0),
        monstersDefeated,
        totalQuestions: Number(
            result.totalQuestions ?? correct + wrong
        ),
        progress: {
            currentStage,
            exp: Number(progress.exp ?? correct * 100),
            level: Number(
                progress.level ?? monstersDefeated + 1
            )
        },
        statistics: {
            correctAnswers: correct,
            wrongAnswers: wrong
        }
    };
}


/* ==================================================
   TEACHER / ADMIN REGISTRATION
================================================== */

function showLoginPage(message = "") {
    document
        .getElementById("loginError")
        .textContent = "";

    document
        .getElementById("loginSuccess")
        .textContent = message;

    showPage("loginPage");
}


function showRegistrationPage() {
    document
        .getElementById("registerError")
        .textContent = "";

    showPage("registerPage");
}


document
    .getElementById("openRegistrationButton")
    .addEventListener(
        "click",
        showRegistrationPage
    );


document
    .getElementById("backToLoginButton")
    .addEventListener(
        "click",
        () => showLoginPage()
    );


document
    .getElementById("registerButton")
    .addEventListener(
        "click",
        handleAdminRegistration
    );


document
    .getElementById("registerConfirmPassword")
    .addEventListener("keydown", event => {
        if (event.key === "Enter") {
            handleAdminRegistration();
        }
    });


async function handleAdminRegistration() {
    let createdUser = null;
    let teacherIntentRegistered = false;
    const fullName = document
        .getElementById("registerName")
        .value
        .trim();

    const email = document
        .getElementById("registerEmail")
        .value
        .trim();

    const password = document
        .getElementById("registerPassword")
        .value;

    const confirmPassword = document
        .getElementById("registerConfirmPassword")
        .value;

    const errorElement =
        document.getElementById("registerError");

    const registerButton =
        document.getElementById("registerButton");


    errorElement.textContent = "";


    if (!fullName) {
        errorElement.textContent =
            "Enter your full name.";
        return;
    }

    if (!email) {
        errorElement.textContent =
            "Enter your email address.";
        return;
    }

    if (password.length < 6) {
        errorElement.textContent =
            "Password must contain at least 6 characters.";
        return;
    }

    if (password !== confirmPassword) {
        errorElement.textContent =
            "The passwords do not match.";
        return;
    }


    registerButton.disabled = true;
    registerButton.textContent =
        "Creating Account...";


    try {
        const credential =
            await createUserWithEmailAndPassword(
                auth,
                email,
                password
            );

        createdUser = credential.user;

        await updateProfile(
            credential.user,
            {
                displayName: fullName
            }
        );

        await set(
            ref(
                database,
                `teacherRegistrations/${credential.user.uid}`
            ),
            {
                uid: credential.user.uid,
                email: credential.user.email || email,
                displayName: fullName,
                status: "pending_verification",
                requestedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            }
        );

        teacherIntentRegistered = true;

        await sendEmailVerification(
            credential.user
        );

        await signOut(auth);


        document
            .getElementById("loginEmail")
            .value = email;

        document
            .getElementById("registerPassword")
            .value = "";

        document
            .getElementById("registerConfirmPassword")
            .value = "";


        showLoginPage(
            "Teacher account created. Check your email and click the verification link, then sign in to activate your Teacher dashboard."
        );
    }

    catch (error) {
        console.error(
            "Firebase registration error:",
            error
        );


        if (createdUser && !teacherIntentRegistered) {
            try {
                await deleteUser(createdUser);
            }
            catch (cleanupError) {
                console.error(
                    "Unable to remove incomplete teacher account:",
                    cleanupError
                );
            }
        }

        if (auth.currentUser) {
            try {
                await signOut(auth);
            }
            catch (signOutError) {
                console.error(
                    "Registration cleanup sign out failed:",
                    signOutError
                );
            }
        }

        switch (error.code) {
            case "auth/email-already-in-use":
                errorElement.textContent =
                    "An account already uses this email address.";
                break;

            case "auth/invalid-email":
                errorElement.textContent =
                    "Enter a valid email address.";
                break;

            case "auth/weak-password":
                errorElement.textContent =
                    "Choose a stronger password.";
                break;

            case "auth/network-request-failed":
                errorElement.textContent =
                    "Network error. Check your internet connection.";
                break;

            case "PERMISSION_DENIED":
            case "permission_denied":
                errorElement.textContent =
                    "Firebase blocked teacher registration. Deploy the updated Realtime Database rules and try again.";
                break;

            default:
                errorElement.textContent =
                    "Unable to create the account. Please try again.";
        }
    }

    finally {
        registerButton.disabled = false;
        registerButton.textContent =
            "Create Account";
    }
}


/* ==================================================
   LOGIN
================================================== */

document
    .getElementById("loginButton")
    .addEventListener("click", handleLogin);


document
    .getElementById("loginPassword")
    .addEventListener("keydown", event => {
        if (event.key === "Enter") {
            handleLogin();
        }
    });


async function handleLogin() {
    const email =
        document
            .getElementById("loginEmail")
            .value
            .trim();

    const password =
        document
            .getElementById("loginPassword")
            .value;

    const errorElement =
        document.getElementById("loginError");

    const loginButton =
        document.getElementById("loginButton");


    errorElement.textContent = "";

    document
        .getElementById("loginSuccess")
        .textContent = "";


    if (!email) {
        errorElement.textContent =
            "Enter your email address.";

        return;
    }


    if (!password) {
        errorElement.textContent =
            "Enter your password.";

        return;
    }


    loginButton.disabled = true;
    loginButton.textContent = "Signing in...";


    try {
        /*
           Authenticate with Firebase Authentication.
        */

        const credential =
            await signInWithEmailAndPassword(
                auth,
                email,
                password
            );

        const firebaseUser = credential.user;

        await reload(firebaseUser);

        let tokenResult = await getIdTokenResult(
            firebaseUser,
            true
        );

        const [adminSnapshot, teacherRegistrationSnapshot] =
            await Promise.all([
                get(ref(database, `admins/${firebaseUser.uid}`)),
                get(ref(
                    database,
                    `teacherRegistrations/${firebaseUser.uid}`
                ))
            ]);

        const adminRecord = adminSnapshot.val();
        const hasTeacherRole =
            tokenResult.claims.role === "teacher" ||
            tokenResult.claims.teacher === true ||
            adminRecord === true ||
            adminRecord?.active === true ||
            adminRecord?.role === "teacher";

        if (hasTeacherRole) {
            openTeacherDashboard(firebaseUser, email);
            return;
        }

        if (teacherRegistrationSnapshot.exists()) {
            if (!firebaseUser.emailVerified) {
                try {
                    await sendEmailVerification(firebaseUser);
                }
                catch (verificationError) {
                    console.warn(
                        "Verification email could not be resent:",
                        verificationError
                    );
                }

                await signOut(auth);
                errorElement.textContent =
                    "Verify your teacher email first. A new verification email was requested; check your inbox and spam folder.";
                return;
            }

            await update(
                ref(database),
                {
                    [`admins/${firebaseUser.uid}`]: true,
                    [`teacherRegistrations/${firebaseUser.uid}/status`]:
                        "active",
                    [`teacherRegistrations/${firebaseUser.uid}/verifiedAt`]:
                        serverTimestamp(),
                    [`teacherRegistrations/${firebaseUser.uid}/activatedAt`]:
                        serverTimestamp(),
                    [`teacherRegistrations/${firebaseUser.uid}/updatedAt`]:
                        serverTimestamp()
                }
            );

            openTeacherDashboard(firebaseUser, email);
            return;
        }

        const studentSnapshot = await get(
            ref(database, `users/${firebaseUser.uid}`)
        );

        if (!studentSnapshot.exists()) {
            await signOut(auth);
            errorElement.textContent =
                "No Tuklask user or teacher registration was found for this account.";
            return;
        }

        openUserDashboard(
            firebaseUser,
            email,
            studentSnapshot.val() || {}
        );
    }

    catch (error) {
        console.error(
            "Firebase login error:",
            error
        );


        if (!currentUser && auth.currentUser) {
            try {
                await signOut(auth);
            }

            catch (signOutError) {
                console.error(
                    "Firebase cleanup sign out error:",
                    signOutError
                );
            }
        }


        if (
            error.code === "PERMISSION_DENIED" ||
            error.code === "permission_denied"
        ) {
            errorElement.textContent =
                "Login succeeded, but Firebase denied database access. Check your Realtime Database rules.";
        }

        else {
            switch (error.code) {
                case "auth/invalid-credential":
                    errorElement.textContent =
                        "Incorrect email or password.";
                    break;

                case "auth/invalid-email":
                    errorElement.textContent =
                        "Invalid email address.";
                    break;

                case "auth/too-many-requests":
                    errorElement.textContent =
                        "Too many login attempts. Please try again later.";
                    break;

                case "auth/network-request-failed":
                    errorElement.textContent =
                        "Network error. Check your internet connection.";
                    break;

                default:
                    errorElement.textContent =
                        "Unable to sign in. Please try again.";
            }
        }
    }

    finally {
        loginButton.disabled = false;
        loginButton.textContent = "Sign In";
    }
}


function openTeacherDashboard(firebaseUser, fallbackEmail = "") {
    currentUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || fallbackEmail,
        displayName: firebaseUser.displayName || "",
        accountType: "admin"
    };

    currentRole = "admin";

    document
        .getElementById("roomTeacherName")
        .value = currentUser.displayName;

    showAdminSection("adminDashboard");
    showPage("adminPage");
    startUsersListener();
    startQuestionsListener();
}


function openUserDashboard(
    firebaseUser,
    fallbackEmail,
    profile
) {
    currentUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || fallbackEmail,
        profile,
        roomKey: normalizeRoomKey(profile?.roomKey || ""),
        studentNumber: String(profile?.studentNumber || ""),
        accountType: "student"
    };

    currentRole = "student";

    showStudentSection("studentDashboard");
    showPage("studentPage");
    startUsersListener();
    loadStudentRoomHistory();
}


/* ==================================================
   FIREBASE USERS LISTENERS

   Students retain the existing global leaderboard.
   Teacher/Admin accounts listen only to /roomMembers
   under room keys they own.
================================================== */

function startUsersListener() {
    stopUsersListeners();


    if (currentRole === "admin") {
        startAdminRoomUsersListener();
        return;
    }


    const usersReference =
        ref(database, "users");


    unsubscribeUsers =
        onValue(
            usersReference,

            snapshot => {
                const firebaseUsers =
                    snapshot.val() || {};


                students = calculateGlobalRanking(
                    Object.entries(firebaseUsers)
                        .map(([uid, user]) =>
                            normalizeStudent(uid, user)
                        )
                );

                generalKnowledgeStudents = students;

                if (
                    currentRole === "student" &&
                    currentUser?.uid &&
                    firebaseUsers[currentUser.uid]
                ) {
                    const nextProfile = firebaseUsers[currentUser.uid];
                    const previousKeys = [
                        ...collectRoomKeysFromProfile(
                            currentUser.profile || {}
                        )
                    ].sort().join("|");
                    const nextKeys = [
                        ...collectRoomKeysFromProfile(nextProfile)
                    ].sort().join("|");

                    currentUser.profile = nextProfile;
                    currentUser.roomKey = normalizeRoomKey(
                        nextProfile.roomKey || currentUser.roomKey
                    );
                    currentUser.studentNumber = String(
                        nextProfile.studentNumber ||
                        currentUser.studentNumber ||
                        ""
                    );

                    if (previousKeys !== nextKeys) {
                        loadStudentRoomHistory();
                    }
                }


                renderEverything();
            },

            error => {
                console.error(
                    "Firebase /users read failed:",
                    error
                );

                alert(
                    "Unable to load the student leaderboard. Check your Realtime Database rules."
                );
            }
        );
}


function startAdminRoomUsersListener() {
    const ownedRoomsReference =
        query(
            ref(database, "roomKeys"),
            orderByChild("createdBy"),
            equalTo(currentUser.uid)
        );


    unsubscribeOwnedRooms =
        onValue(
            ownedRoomsReference,

            snapshot => {
                stopAdminRoomUserListeners();


                const rooms = snapshot.val() || {};

                ownedRooms = Object.entries(rooms)
                    .map(([key, room]) => ({
                        key,
                        ...room,
                        active: room?.active !== false
                    }))
                    .sort((a, b) =>
                        a.key.localeCompare(b.key)
                    );

                ownedRoomKeys =
                    ownedRooms.map(room => room.key);


                populateOwnedRoomSelectors();
                renderRooms();


                if (!ownedRoomKeys.length) {
                    students = [];
                    generalKnowledgeStudents = [];
                    learningBasedStudents = [];
                    clearActiveRoomKey();
                    renderEverything();
                    return;
                }


                if (
                    activeRoomKey &&
                    !ownedRoomKeys.includes(activeRoomKey)
                ) {
                    clearActiveRoomKey();
                }


                ownedRoomKeys.forEach(roomKey => {
                    adminRoomStudentGroups.set(
                        roomKey,
                        []
                    );


                    const roomStudentsReference =
                        ref(
                            database,
                            `roomMembers/${roomKey}`
                        );


                    const unsubscribe = onValue(
                        roomStudentsReference,

                        roomSnapshot => {
                            const roomUsers =
                                roomSnapshot.val() || {};


                            adminRoomStudentGroups.set(
                                roomKey,
                                Object.entries(roomUsers)
                                    .map(([uid, user]) =>
                                        ({
                                            ...normalizeRoomMember(
                                                uid,
                                                roomKey,
                                                user
                                            ),
                                            teacherName: String(
                                                user?.teacherName ||
                                                ownedRooms.find(
                                                    room => room.key === roomKey
                                                )?.teacherName ||
                                                ""
                                            )
                                        })
                                    )
                            );


                            rebuildAdminRoomStudents();
                        },

                        error => {
                            console.error(
                                `Firebase room members read failed for room ${roomKey}:`,
                                error
                            );

                            adminRoomStudentGroups.set(
                                roomKey,
                                []
                            );

                            rebuildAdminRoomStudents();
                        }
                    );


                    unsubscribeAdminRoomUsers.push(
                        unsubscribe
                    );


                    adminGeneralStudentGroups.set(
                        roomKey,
                        []
                    );

                    const generalStudentsReference = query(
                        ref(database, "users"),
                        orderByChild("roomKey"),
                        equalTo(roomKey)
                    );

                    const unsubscribeGeneral = onValue(
                        generalStudentsReference,
                        generalSnapshot => {
                            const generalUsers =
                                generalSnapshot.val() || {};

                            adminGeneralStudentGroups.set(
                                roomKey,
                                Object.entries(generalUsers)
                                    .map(([uid, user]) =>
                                        normalizeStudent(uid, user)
                                    )
                            );

                            rebuildAdminGeneralStudents();
                        },
                        error => {
                            console.error(
                                `Firebase general-knowledge users read failed for room ${roomKey}:`,
                                error
                            );
                            adminGeneralStudentGroups.set(roomKey, []);
                            rebuildAdminGeneralStudents();
                        }
                    );

                    unsubscribeAdminGeneralUsers.push(
                        unsubscribeGeneral
                    );
                });
            },

            error => {
                console.error(
                    "Firebase owned rooms read failed:",
                    error
                );

                students = [];
                generalKnowledgeStudents = [];
                learningBasedStudents = [];
                renderEverything();

                alert(
                    "Unable to load the students assigned to your rooms. Check your Firebase rules."
                );
            }
        );
}


function rebuildAdminRoomStudents() {
    const uniqueStudents = new Map();


    adminRoomStudentGroups
        .forEach(roomStudents => {
            roomStudents.forEach(student => {
                uniqueStudents.set(
                    student.membershipId,
                    student
                );
            });
        });


    learningBasedStudents = calculateLearningRanking(
        [...uniqueStudents.values()]
    );

    students = learningBasedStudents;

    renderEverything();
    renderRooms();
}


function calculateLearningRanking(list) {
    return [...list]
        .sort((a, b) => {
            const aCompleted = a.status === "completed" ? 1 : 0;
            const bCompleted = b.status === "completed" ? 1 : 0;

            if (bCompleted !== aCompleted) {
                return bCompleted - aCompleted;
            }

            const aAnswered =
                a.statistics.correctAnswers +
                a.statistics.wrongAnswers;
            const bAnswered =
                b.statistics.correctAnswers +
                b.statistics.wrongAnswers;

            if (bAnswered !== aAnswered) {
                return bAnswered - aAnswered;
            }

            if (
                b.statistics.correctAnswers !==
                a.statistics.correctAnswers
            ) {
                return (
                    b.statistics.correctAnswers -
                    a.statistics.correctAnswers
                );
            }

            return a.nickname.localeCompare(b.nickname);
        })
        .map((student, index) => ({
            ...student,
            rank: index + 1
        }));
}


function rebuildAdminGeneralStudents() {
    const uniqueStudents = new Map();

    adminGeneralStudentGroups.forEach(roomStudents => {
        roomStudents.forEach(student => {
            uniqueStudents.set(student.uid, student);
        });
    });

    generalKnowledgeStudents = calculateGlobalRanking(
        [...uniqueStudents.values()]
    );

    renderEverything();
}


function stopAdminRoomUserListeners() {
    unsubscribeAdminRoomUsers
        .forEach(unsubscribe => unsubscribe());

    unsubscribeAdminRoomUsers = [];
    adminRoomStudentGroups.clear();

    unsubscribeAdminGeneralUsers
        .forEach(unsubscribe => unsubscribe());

    unsubscribeAdminGeneralUsers = [];
    adminGeneralStudentGroups.clear();
}


function stopUsersListeners() {
    if (unsubscribeUsers) {
        unsubscribeUsers();
        unsubscribeUsers = null;
    }


    if (unsubscribeOwnedRooms) {
        unsubscribeOwnedRooms();
        unsubscribeOwnedRooms = null;
    }


    stopAdminRoomUserListeners();
    ownedRoomKeys = [];
    ownedRooms = [];
}


function startStudentRoomListener(
    roomKey,
    studentNumber = ""
) {
    if (unsubscribeStudentRoom) {
        unsubscribeStudentRoom();
        unsubscribeStudentRoom = null;
    }


    currentRoomMembership = null;


    if (
        currentRole !== "student" ||
        !currentUser?.uid ||
        !roomKey
    ) {
        renderCurrentStudent();
        return;
    }


    const memberReference = studentNumber
        ? query(
            ref(database, `roomMembers/${roomKey}`),
            orderByChild("studentNumber"),
            equalTo(studentNumber)
        )
        : ref(
            database,
            `roomMembers/${roomKey}/${currentUser.uid}`
        );


    unsubscribeStudentRoom = onValue(
        memberReference,
        snapshot => {
            if (!snapshot.exists()) {
                currentRoomMembership = null;
            }

            else if (studentNumber) {
                const firstMembership =
                    Object.entries(snapshot.val())[0];


                currentRoomMembership = firstMembership
                    ? normalizeRoomMember(
                        firstMembership[0],
                        roomKey,
                        firstMembership[1]
                    )
                    : null;
            }

            else {
                currentRoomMembership = normalizeRoomMember(
                    currentUser.uid,
                    roomKey,
                    snapshot.val()
                );
            }

            if (currentRoomMembership) {
                upsertStudentRoomHistory(currentRoomMembership);
            }

            renderCurrentStudent();
            renderStudentRoomHistory();
        },
        error => {
            console.error(
                "Firebase student room progress read failed:",
                error
            );
            currentRoomMembership = null;
            renderCurrentStudent();
        }
    );
}


function collectRoomKeysFromProfile(profile = {}) {
    const keys = new Set();

    const addRoomKey = value => {
        const key = normalizeRoomKey(
            typeof value === "object"
                ? value?.roomKey || value?.key || ""
                : value
        );

        if (key) {
            keys.add(key);
        }
    };

    addRoomKey(profile.roomKey);
    addRoomKey(profile.learningRoomKey);

    [
        profile.roomHistory,
        profile.learningRooms,
        profile.joinedRooms
    ].forEach(collection => {
        if (Array.isArray(collection)) {
            collection.forEach(addRoomKey);
            return;
        }

        if (collection && typeof collection === "object") {
            Object.entries(collection).forEach(([key, value]) => {
                addRoomKey(key);
                addRoomKey(value);
            });
        }
    });

    return keys;
}


async function findStudentMembership(roomKey) {
    const directSnapshot = await get(
        ref(database, `roomMembers/${roomKey}/${currentUser.uid}`)
    );

    if (directSnapshot.exists()) {
        return normalizeRoomMember(
            currentUser.uid,
            roomKey,
            directSnapshot.val()
        );
    }

    if (!currentUser.studentNumber) {
        return null;
    }

    const membershipSnapshot = await get(
        query(
            ref(database, `roomMembers/${roomKey}`),
            orderByChild("studentNumber"),
            equalTo(currentUser.studentNumber)
        )
    );

    if (!membershipSnapshot.exists()) {
        return null;
    }

    const firstMembership = Object.entries(
        membershipSnapshot.val()
    )[0];

    return firstMembership
        ? normalizeRoomMember(
            firstMembership[0],
            roomKey,
            firstMembership[1]
        )
        : null;
}


async function loadStudentRoomHistory() {
    if (
        currentRole !== "student" ||
        !currentUser?.uid
    ) {
        return;
    }

    const loadId = ++studentRoomHistoryLoadId;
    const roomKeys = collectRoomKeysFromProfile(
        currentUser.profile || {}
    );
    studentRoomHistoryDiscoveryLimited = false;

    try {
        const allRoomsSnapshot = await get(
            ref(database, "roomKeys")
        );

        if (allRoomsSnapshot.exists()) {
            Object.keys(allRoomsSnapshot.val() || {})
                .forEach(key => roomKeys.add(normalizeRoomKey(key)));
        }
    }
    catch {
        /* Current Firebase rules may only allow direct room reads. */
        studentRoomHistoryDiscoveryLimited = true;
    }

    const historyEntries = [];

    await Promise.all(
        [...roomKeys].filter(Boolean).map(async roomKey => {
            try {
                const [membership, roomSnapshot] = await Promise.all([
                    findStudentMembership(roomKey),
                    get(ref(database, `roomKeys/${roomKey}`))
                ]);

                if (!membership) {
                    return;
                }

                const room = roomSnapshot.val() || {};
                studentRoomDetails.set(roomKey, room);

                historyEntries.push({
                    ...membership,
                    teacherName:
                        membership.teacherName ||
                        String(room.teacherName || ""),
                    yearLevel:
                        membership.yearLevel ||
                        String(room.gradeLevel || ""),
                    section:
                        membership.section ||
                        String(room.section || ""),
                    yearSection: [
                        membership.yearLevel || room.gradeLevel,
                        membership.section || room.section
                    ].filter(Boolean).join(" / ") || "N/A"
                });
            }
            catch (error) {
                console.warn(
                    `Unable to inspect Learning-Based room ${roomKey}:`,
                    error
                );
            }
        })
    );

    if (loadId !== studentRoomHistoryLoadId) {
        return;
    }

    studentRoomHistory = historyEntries.sort(
        (a, b) => b.joinedAt - a.joinedAt
    );

    await Promise.all(
        studentRoomHistory.map(async membership => {
            try {
                const membersSnapshot = await get(
                    ref(
                        database,
                        `roomMembers/${membership.roomKey}`
                    )
                );

                studentLearningLeaderboardsByRoom.set(
                    membership.roomKey,
                    calculateLearningRanking(
                        Object.entries(membersSnapshot.val() || {})
                            .map(([uid, member]) =>
                                normalizeRoomMember(
                                    uid,
                                    membership.roomKey,
                                    member
                                )
                            )
                    )
                );
            }
            catch {
                studentLearningLeaderboardsByRoom.set(
                    membership.roomKey,
                    []
                );
            }
        })
    );

    if (loadId !== studentRoomHistoryLoadId) {
        return;
    }

    const currentProfileRoom = normalizeRoomKey(
        currentUser.roomKey
    );
    const preferredRoom =
        studentRoomHistory.some(
            room => room.roomKey === currentProfileRoom
        )
            ? currentProfileRoom
            : studentRoomHistory[0]?.roomKey || "";

    if (preferredRoom) {
        selectStudentRoom(preferredRoom);
    }
    else {
        currentRoomMembership = null;
        selectedStudentRoomKey = "";
        studentLearningLeaderboard = [];
        renderStudentRoomHistory();
        renderCurrentStudent();
        renderStudentLeaderboard();
    }
}


function upsertStudentRoomHistory(membership) {
    const index = studentRoomHistory.findIndex(
        item => item.roomKey === membership.roomKey
    );

    const room = studentRoomDetails.get(membership.roomKey) || {};
    const enriched = {
        ...membership,
        teacherName:
            membership.teacherName ||
            String(room.teacherName || ""),
        yearSection: [
            membership.yearLevel || room.gradeLevel,
            membership.section || room.section
        ].filter(Boolean).join(" / ") || membership.yearSection
    };

    if (index >= 0) {
        studentRoomHistory[index] = enriched;
    }
    else {
        studentRoomHistory.push(enriched);
    }

    studentRoomHistory.sort((a, b) => b.joinedAt - a.joinedAt);
}


async function selectStudentRoom(roomKey) {
    const normalizedRoomKey = normalizeRoomKey(roomKey);

    if (!normalizedRoomKey) {
        return;
    }

    selectedStudentRoomKey = normalizedRoomKey;
    currentRoomMembership =
        studentRoomHistory.find(
            item => item.roomKey === normalizedRoomKey
        ) || null;

    startStudentRoomListener(
        normalizedRoomKey,
        currentUser.studentNumber
    );

    renderStudentRoomHistory();
    renderCurrentStudent();

    try {
        const [membersSnapshot, roomSnapshot] = await Promise.all([
            get(ref(database, `roomMembers/${normalizedRoomKey}`)),
            get(ref(database, `roomKeys/${normalizedRoomKey}`))
        ]);

        const room = roomSnapshot.val() || {};
        studentRoomDetails.set(normalizedRoomKey, room);

        studentLearningLeaderboard = calculateLearningRanking(
            Object.entries(membersSnapshot.val() || {})
                .map(([uid, member]) => ({
                    ...normalizeRoomMember(
                        uid,
                        normalizedRoomKey,
                        member
                    ),
                    teacherName: String(
                        member?.teacherName ||
                        room.teacherName ||
                        ""
                    )
                }))
        );

        studentLearningLeaderboardsByRoom.set(
            normalizedRoomKey,
            studentLearningLeaderboard
        );
    }
    catch (error) {
        console.error(
            "Unable to load the Learning-Based room leaderboard:",
            error
        );
        studentLearningLeaderboard = [];
        studentLearningLeaderboardsByRoom.set(
            normalizedRoomKey,
            []
        );
    }

    populateAllFilters();
    renderStudentRoomHistory();
    renderStudentLeaderboard();
}


/* ==================================================
   STOP FIREBASE LISTENERS
================================================== */

function stopFirebaseListeners() {
    stopUsersListeners();


    if (unsubscribeStudentRoom) {
        unsubscribeStudentRoom();
        unsubscribeStudentRoom = null;
    }


    currentRoomMembership = null;
    studentRoomHistory = [];
    selectedStudentRoomKey = "";
    studentLearningLeaderboard = [];
    studentLearningLeaderboardsByRoom.clear();
    studentRoomDetails.clear();
    studentRoomHistoryLoadId += 1;
    studentRoomHistoryDiscoveryLimited = false;


    if (unsubscribeQuestions) {
        unsubscribeQuestions();
        unsubscribeQuestions = null;
    }
}


/* ==================================================
   RENDER EVERYTHING
================================================== */

function renderEverything() {
    populateAllFilters();

    renderAdminDashboard();

    renderStudentManagement();

    renderAdminLeaderboard();

    renderStudentLeaderboard();

    renderCurrentStudent();

    renderStudentRoomHistory();
}


/* ==================================================
   LOGOUT
================================================== */

async function logoutToLogin() {
    stopFirebaseListeners();


    try {
        await signOut(auth);
    }

    catch (error) {
        console.error(
            "Firebase sign out error:",
            error
        );
    }


    currentUser = null;
    currentRole = null;
    students = [];
    generalKnowledgeStudents = [];
    learningBasedStudents = [];
    questions = [];
    clearActiveRoomKey();


    document
        .getElementById("loginEmail")
        .value = "";

    document
        .getElementById("loginPassword")
        .value = "";

    document
        .getElementById("loginError")
        .textContent = "";


    closeAllSidebars();

    showPage("loginPage");
}


/* ==================================================
   ADMIN NAVIGATION
================================================== */

function showAdminSection(sectionId) {
    if (
        sectionId === "questionManagement" &&
        currentRole !== "admin"
    ) {
        return;
    }


    document
        .querySelectorAll(
            "#adminPage .content-section"
        )
        .forEach(section => {
            section.classList.remove("active");
        });


    document
        .getElementById(sectionId)
        .classList.add("active");


    document
        .querySelectorAll(".admin-nav")
        .forEach(button => {
            button.classList.remove("active");
        });


    const activeButton =
        document.querySelector(
            `.admin-nav[data-admin-page="${sectionId}"]`
        );


    if (activeButton) {
        activeButton.classList.add("active");
    }


    closeAllSidebars();

    window.scrollTo(0, 0);
}


document
    .querySelectorAll(".admin-nav")
    .forEach(button => {
        button.addEventListener(
            "click",
            () => {
                showAdminSection(
                    button.dataset.adminPage
                );
            }
        );
    });


/* ==================================================
   ADMIN QUESTION MANAGEMENT

   Firebase:
       /questions/{questionId}

   The listener is started only after an administrator
   has signed in and is removed on logout/session end.
================================================== */

function hasAdminQuestionAccess() {
    return Boolean(
        currentRole === "admin" &&
        currentUser?.accountType === "admin" &&
        auth.currentUser?.uid === currentUser.uid
    );
}


function setQuestionMessage(message, isError = false) {
    const messageElement =
        document.getElementById(
            "questionFormMessage"
        );


    messageElement.textContent = message;

    messageElement.classList.toggle(
        "error",
        isError
    );
}


function normalizeRoomKey(value) {
    return String(value || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
}


function populateOwnedRoomSelectors() {
    const selector = document.getElementById(
        "questionActiveRoomSelect"
    );


    if (!selector) {
        return;
    }


    const previousValue = activeRoomKey;


    selector.innerHTML = ownedRooms.length
        ? '<option value="">Select a room</option>'
        : '<option value="">Create a room first</option>';


    ownedRooms.forEach(room => {
        const option = document.createElement("option");
        option.value = room.key;
        option.textContent = `${room.key} — ${room.gradeLevel || ""} ${room.section || ""}${room.active === false ? " (Inactive)" : ""}`.trim();
        selector.appendChild(option);
    });


    if (ownedRoomKeys.includes(previousValue)) {
        selector.value = previousValue;
    }
}


function renderRooms() {
    const tbody = document.getElementById("roomTable");
    const count = document.getElementById("roomCount");


    if (!tbody || !count) {
        return;
    }


    count.textContent = `${ownedRooms.length} ${ownedRooms.length === 1 ? "room" : "rooms"}`;


    if (!ownedRooms.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="question-empty-state">
                    Create your first room above.
                </td>
            </tr>
        `;
        return;
    }


    tbody.innerHTML = ownedRooms.map(room => {
        const memberCount = (
            adminRoomStudentGroups.get(room.key) || []
        ).length;


        return `
            <tr>
                <td><strong>${escapeHTML(room.key)}</strong></td>
                <td>${escapeHTML(room.gradeLevel || "-")} / ${escapeHTML(room.section || "-")}</td>
                <td>
                    <span class="room-status ${room.active === false ? "inactive" : "active"}">
                        ${room.active === false ? "Inactive" : "Active"}
                    </span>
                </td>
                <td>${memberCount}</td>
                <td>
                    <div class="question-actions">
                        <button class="question-edit-button" type="button" data-room-action="use" data-room-key="${escapeHTML(room.key)}">Use</button>
                        <button class="question-edit-button" type="button" data-room-action="toggle" data-room-key="${escapeHTML(room.key)}">
                            ${room.active === false ? "Activate" : "Deactivate"}
                        </button>
                        <button class="question-delete-button" type="button" data-room-action="delete" data-room-key="${escapeHTML(room.key)}">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}


function useOwnedRoom(roomKey, openQuestions = true) {
    const room = ownedRooms.find(
        item => item.key === roomKey
    );


    if (!room) {
        return;
    }


    setRoomDetailsForm(room);
    document.getElementById("questionRoomKey").value = room.key;
    setActiveRoomKey(room.key, false);
    setRoomKeyMessage(
        `Room ${room.key} is selected${room.active === false ? " but currently inactive" : ""}.`
    );


    if (openQuestions) {
        showAdminSection("questionManagement");
    }
}


async function toggleRoomStatus(roomKey) {
    const room = ownedRooms.find(
        item => item.key === roomKey
    );


    if (!room || !hasAdminQuestionAccess()) {
        return;
    }


    try {
        await update(
            ref(database, `roomKeys/${roomKey}`),
            {
                active: room.active === false,
                updatedAt: serverTimestamp(),
                updatedBy: currentUser.uid
            }
        );
    }
    catch (error) {
        console.error("Firebase room status update failed:", error);
        alert("Unable to change the room status. Check your connection and Firebase rules.");
    }
}


async function deleteRoom(roomKey) {
    if (!hasAdminQuestionAccess()) {
        return;
    }


    const shouldDelete = window.confirm(
        `Delete room ${roomKey}? Empty rooms only can be deleted.`
    );


    if (!shouldDelete) {
        return;
    }


    try {
        const membersSnapshot = await get(
            ref(database, `roomMembers/${roomKey}`)
        );
        const roomHasQuestions = questions.some(
            question => question.roomKey === roomKey
        );


        if (membersSnapshot.exists() || roomHasQuestions) {
            alert("This room still has students or questions. Remove those records first so learning data is not lost.");
            return;
        }


        await remove(ref(database, `roomKeys/${roomKey}`));


        if (activeRoomKey === roomKey) {
            clearActiveRoomKey();
        }
    }
    catch (error) {
        console.error("Firebase room delete failed:", error);
        alert("Unable to delete the room. Check your connection and Firebase rules.");
    }
}


function setRoomKeyMessage(message, isError = false) {
    const messageElement =
        document.getElementById(
            "roomKeyMessage"
        );


    messageElement.textContent = message;

    messageElement.classList.toggle(
        "error",
        isError
    );
}


function getRoomDetailsFromForm() {
    return {
        teacherName: document
            .getElementById("roomTeacherName")
            .value
            .trim(),
        gradeLevel: document
            .getElementById("roomGradeLevel")
            .value
            .trim(),
        section: document
            .getElementById("roomSection")
            .value
            .trim()
    };
}


function setRoomDetailsForm(room = {}) {
    document
        .getElementById("roomTeacherName")
        .value = room.teacherName || "";

    document
        .getElementById("roomGradeLevel")
        .value = room.gradeLevel || "";

    document
        .getElementById("roomSection")
        .value = room.section || "";
}


function validateRoomDetails(room) {
    if (!room.teacherName) {
        return "Enter the teacher name for this room.";
    }

    if (!room.gradeLevel) {
        return "Enter the grade level for this room.";
    }

    if (!room.section) {
        return "Enter the section for this room.";
    }

    return "";
}


function setActiveRoomKey(
    roomKey,
    announce = true,
    resetEditing = true
) {
    const normalizedRoomKey =
        normalizeRoomKey(roomKey);


    if (
        !/^[A-Z0-9_-]{4,24}$/
            .test(normalizedRoomKey)
    ) {
        setRoomKeyMessage(
            "Room key must contain 4–24 letters, numbers, hyphens or underscores.",
            true
        );

        return false;
    }


    if (resetEditing && editingQuestionId) {
        resetQuestionForm();
    }


    if (
        activeRoomKey &&
        activeRoomKey !== normalizedRoomKey &&
        (
            pendingCsvQuestions.length ||
            pendingCsvErrors.length
        )
    ) {
        clearCsvImport(
            "Room changed. Choose the CSV file again for the new room."
        );
    }


    activeRoomKey = normalizedRoomKey;

    document
        .getElementById("questionRoomKey")
        .value = activeRoomKey;


    const activeRoomSelector = document.getElementById(
        "questionActiveRoomSelect"
    );


    if (activeRoomSelector) {
        activeRoomSelector.value = activeRoomKey;
    }

    document
        .getElementById("questionFormFields")
        .disabled = false;

    document
        .getElementById("activeRoomKeyDisplay")
        .textContent = activeRoomKey;

    document
        .getElementById("activeRoomKeyStatus")
        .classList
        .remove("hidden");

    document
        .getElementById("activateRoomKeyButton")
        .textContent = "Save / Open Room";

    document
        .getElementById(
            "questionFormDescription"
        )
        .textContent =
            `New questions will be added to room ${activeRoomKey}.`;


    const roomKeyFilter =
        document.getElementById(
            "questionRoomKeyFilter"
        );


    if (
        !Array.from(roomKeyFilter.options)
            .some(option => option.value === activeRoomKey)
    ) {
        roomKeyFilter.add(
            new Option(
                activeRoomKey,
                activeRoomKey
            )
        );
    }


    roomKeyFilter.value = activeRoomKey;
    renderQuestions();


    if (announce) {
        setRoomKeyMessage(
            `Room ${activeRoomKey} is active. You can now add questions.`
        );
    }


    return true;
}


async function activateRoomKeyFromInput() {
    if (!hasAdminQuestionAccess()) {
        setRoomKeyMessage(
            "Administrator access is required.",
            true
        );

        return;
    }


    const roomKey = document
        .getElementById("questionRoomKey")
        .value;


    const normalizedRoomKey =
        normalizeRoomKey(roomKey);


    if (
        !/^[A-Z0-9_-]{4,24}$/
            .test(normalizedRoomKey)
    ) {
        setRoomKeyMessage(
            "Room key must contain 4–24 letters, numbers, hyphens or underscores.",
            true
        );

        return;
    }


    const activateButton =
        document.getElementById(
            "activateRoomKeyButton"
        );


    activateButton.disabled = true;
    activateButton.textContent = "Saving Room Key...";

    setRoomKeyMessage(
        "Checking and saving the room key..."
    );


    try {
        const roomKeyReference =
            ref(
                database,
                `roomKeys/${normalizedRoomKey}`
            );

        const roomKeySnapshot =
            await get(roomKeyReference);


        if (roomKeySnapshot.exists()) {
            const savedRoom =
                roomKeySnapshot.val() || {};


            if (
                savedRoom.createdBy !== currentUser.uid
            ) {
                setRoomKeyMessage(
                    "That room key is already being used by another teacher. Choose a different key.",
                    true
                );

                if (activeRoomKey) {
                    document
                        .getElementById("questionRoomKey")
                        .value = activeRoomKey;
                }

                return;
            }


            const enteredRoomDetails =
                getRoomDetailsFromForm();
            const enteredValidationError =
                validateRoomDetails(enteredRoomDetails);


            if (!enteredValidationError) {
                await update(
                    roomKeyReference,
                    {
                        ...enteredRoomDetails,
                        updatedAt: serverTimestamp(),
                        updatedBy: currentUser.uid
                    }
                );
            }

            else if (!validateRoomDetails(savedRoom)) {
                setRoomDetailsForm(savedRoom);
            }

            else {
                setRoomKeyMessage(
                    "This existing room is missing details. Enter the teacher name, grade level and section, then try again.",
                    true
                );
                return;
            }
        }

        else {
            const roomDetails =
                getRoomDetailsFromForm();

            const roomValidationError =
                validateRoomDetails(roomDetails);


            if (roomValidationError) {
                setRoomKeyMessage(
                    roomValidationError,
                    true
                );

                return;
            }


            await set(
                roomKeyReference,
                {
                    key: normalizedRoomKey,
                    ...roomDetails,
                    active: true,
                    createdAt: serverTimestamp(),
                    createdBy: currentUser.uid,
                    updatedAt: serverTimestamp(),
                    updatedBy: currentUser.uid
                }
            );
        }


        if (hasAdminQuestionAccess()) {
            setActiveRoomKey(normalizedRoomKey);
        }
    }

    catch (error) {
        console.error(
            "Firebase room key save failed:",
            error
        );

        setRoomKeyMessage(
            "Unable to save the room key. Check your connection and Firebase room-key rules.",
            true
        );

        if (activeRoomKey) {
            document
                .getElementById("questionRoomKey")
                .value = activeRoomKey;
        }
    }

    finally {
        activateButton.disabled = false;
        activateButton.textContent =
            activeRoomKey
                ? "Save / Open Room"
                : "Create / Open Room";
    }
}


function clearActiveRoomKey() {
    activeRoomKey = "";


    clearCsvImport(
        "Select a room before importing a CSV file."
    );

    document
        .getElementById("questionRoomKey")
        .value = "";

    document
        .getElementById("questionFormFields")
        .disabled = true;

    setRoomDetailsForm({
        teacherName:
            currentRole === "admin"
                ? currentUser?.displayName || ""
                : ""
    });

    document
        .getElementById("activeRoomKeyStatus")
        .classList
        .add("hidden");

    document
        .getElementById("activateRoomKeyButton")
        .textContent = "Create / Open Room";


    const activeRoomSelector = document.getElementById(
        "questionActiveRoomSelect"
    );


    if (activeRoomSelector) {
        activeRoomSelector.value = "";
    }


    resetQuestionForm();

    setRoomKeyMessage(
        "Create or open a room before adding questions."
    );
}


function normalizeQuestion(id, question) {
    const options = question?.options || {};


    return {
        id,
        text: String(
            question?.text || ""
        ),
        options: {
            A: String(options.A || ""),
            B: String(options.B || ""),
            C: String(options.C || ""),
            D: String(options.D || "")
        },
        roomKey: String(
            question?.roomKey || ""
        ).toUpperCase(),
        correctAnswer: String(
            question?.correctAnswer || ""
        ).toUpperCase(),
        createdAt: Number(
            question?.createdAt || 0
        ),
        updatedAt: Number(
            question?.updatedAt || 0
        )
    };
}


function startQuestionsListener() {
    if (!hasAdminQuestionAccess()) {
        return;
    }


    if (unsubscribeQuestions) {
        unsubscribeQuestions();
        unsubscribeQuestions = null;
    }


    const questionsReference =
        query(
            ref(database, "questions"),
            orderByChild("createdBy"),
            equalTo(currentUser.uid)
        );


    unsubscribeQuestions =
        onValue(
            questionsReference,

            snapshot => {
                if (!hasAdminQuestionAccess()) {
                    return;
                }


                const firebaseQuestions =
                    snapshot.val() || {};


                questions =
                    Object.entries(firebaseQuestions)
                        .map(([id, question]) =>
                            normalizeQuestion(
                                id,
                                question
                            )
                        );


                populateQuestionFilters();
                renderQuestions();
            },

            error => {
                console.error(
                    "Firebase /questions read failed:",
                    error
                );


                questions = [];
                renderQuestions(
                    "Unable to load questions. Check the Firebase question rules."
                );

                setQuestionMessage(
                    "Firebase denied access to the question bank.",
                    true
                );
            }
        );
}


function getQuestionFormValues() {
    return {
        text: document
            .getElementById("questionText")
            .value
            .trim(),
        options: {
            A: document
                .getElementById("questionOptionA")
                .value
                .trim(),
            B: document
                .getElementById("questionOptionB")
                .value
                .trim(),
            C: document
                .getElementById("questionOptionC")
                .value
                .trim(),
            D: document
                .getElementById("questionOptionD")
                .value
                .trim()
        },
        roomKey: activeRoomKey,
        correctAnswer: document
            .getElementById(
                "questionCorrectAnswer"
            )
            .value
    };
}


function validateQuestion(question) {
    if (!question.text) {
        return "Enter the question text.";
    }


    if (
        Object.values(question.options)
            .some(option => !option)
    ) {
        return "Complete all four answer options.";
    }


    if (
        !/^[A-Z0-9_-]{4,24}$/
            .test(question.roomKey)
    ) {
        return "Room key must contain 4–24 letters, numbers, hyphens or underscores.";
    }


    if (
        !["A", "B", "C", "D"]
            .includes(question.correctAnswer)
    ) {
        return "Select the correct answer.";
    }


    return "";
}


/* ==================================================
   CSV QUESTION IMPORT

   Expected columns:
   question, optionA, optionB, optionC, optionD,
   correctAnswer
================================================== */

function setCsvImportMessage(message, isError = false) {
    const messageElement = document.getElementById(
        "csvImportMessage"
    );


    messageElement.textContent = message;
    messageElement.classList.toggle("error", isError);
}


function parseCsvRows(csvText) {
    const text = String(csvText || "")
        .replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let field = "";
    let insideQuotes = false;


    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];


        if (insideQuotes) {
            if (character === '"') {
                if (text[index + 1] === '"') {
                    field += '"';
                    index += 1;
                }

                else {
                    insideQuotes = false;
                }
            }

            else {
                field += character;
            }


            continue;
        }


        if (character === '"') {
            insideQuotes = true;
        }

        else if (character === ",") {
            row.push(field);
            field = "";
        }

        else if (character === "\n") {
            row.push(field.replace(/\r$/, ""));


            if (row.some(value => String(value).trim())) {
                rows.push(row);
            }


            row = [];
            field = "";
        }

        else {
            field += character;
        }
    }


    if (insideQuotes) {
        throw new Error(
            "The CSV contains an unfinished quoted value."
        );
    }


    row.push(field.replace(/\r$/, ""));


    if (row.some(value => String(value).trim())) {
        rows.push(row);
    }


    return rows;
}


function normalizeCsvHeader(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}


function getCsvColumnIndexes(headerRow) {
    const normalizedHeaders = headerRow.map(
        normalizeCsvHeader
    );
    const aliases = {
        question: ["question", "text", "questiontext"],
        optionA: ["optiona", "a", "answera"],
        optionB: ["optionb", "b", "answerb"],
        optionC: ["optionc", "c", "answerc"],
        optionD: ["optiond", "d", "answerd"],
        correctAnswer: [
            "correctanswer",
            "correct",
            "answer"
        ]
    };
    const indexes = {};


    Object.entries(aliases).forEach(
        ([columnName, acceptedHeaders]) => {
            indexes[columnName] =
                normalizedHeaders.findIndex(header =>
                    acceptedHeaders.includes(header)
                );
        }
    );


    return indexes;
}


function validateCsvRows(rows) {
    if (rows.length < 2) {
        return {
            questions: [],
            errors: [
                "The CSV must contain a header and at least one question."
            ]
        };
    }


    const indexes = getCsvColumnIndexes(rows[0]);
    const missingColumns = Object.entries(indexes)
        .filter(([, index]) => index < 0)
        .map(([columnName]) => columnName);


    if (missingColumns.length) {
        return {
            questions: [],
            errors: [
                `Missing columns: ${missingColumns.join(", ")}.`
            ]
        };
    }


    const dataRows = rows.slice(1).filter(row =>
        row.some(value => String(value).trim())
    );


    if (!dataRows.length) {
        return {
            questions: [],
            errors: [
                "The CSV does not contain any question rows."
            ]
        };
    }


    if (dataRows.length > 200) {
        return {
            questions: [],
            errors: [
                "A single CSV file can contain a maximum of 200 questions."
            ]
        };
    }


    const parsedQuestions = [];
    const errors = [];
    const fileQuestions = new Set();
    const savedQuestions = new Set(
        questions
            .filter(question =>
                question.roomKey === activeRoomKey
            )
            .map(question =>
                question.text.trim().toLowerCase()
            )
    );


    dataRows.forEach((row, rowIndex) => {
        const csvRowNumber = rowIndex + 2;
        const text = String(
            row[indexes.question] || ""
        ).trim();
        const options = {
            A: String(row[indexes.optionA] || "").trim(),
            B: String(row[indexes.optionB] || "").trim(),
            C: String(row[indexes.optionC] || "").trim(),
            D: String(row[indexes.optionD] || "").trim()
        };
        const correctAnswer = String(
            row[indexes.correctAnswer] || ""
        )
            .trim()
            .toUpperCase()
            .replace(/^OPTION\s*/, "");
        const rowErrors = [];


        if (!text) {
            rowErrors.push("question is empty");
        }

        else if (text.length > 500) {
            rowErrors.push("question exceeds 500 characters");
        }


        Object.entries(options).forEach(([letter, option]) => {
            if (!option) {
                rowErrors.push(`option ${letter} is empty`);
            }

            else if (option.length > 200) {
                rowErrors.push(
                    `option ${letter} exceeds 200 characters`
                );
            }
        });


        if (!["A", "B", "C", "D"].includes(correctAnswer)) {
            rowErrors.push(
                "correctAnswer must be A, B, C or D"
            );
        }


        const questionKey = text.toLowerCase();


        if (questionKey && fileQuestions.has(questionKey)) {
            rowErrors.push("duplicate question in this CSV");
        }


        if (questionKey && savedQuestions.has(questionKey)) {
            rowErrors.push(
                `question already exists in room ${activeRoomKey}`
            );
        }


        if (rowErrors.length) {
            errors.push(
                `Row ${csvRowNumber}: ${rowErrors.join("; ")}.`
            );
            return;
        }


        fileQuestions.add(questionKey);
        parsedQuestions.push({
            text,
            options,
            correctAnswer
        });
    });


    return {
        questions: parsedQuestions,
        errors
    };
}


function renderCsvPreview() {
    const wrapper = document.getElementById(
        "csvPreviewWrapper"
    );
    const summary = document.getElementById(
        "csvPreviewSummary"
    );
    const tableBody = document.getElementById(
        "csvPreviewTable"
    );
    const importButton = document.getElementById(
        "importCsvButton"
    );


    if (
        !pendingCsvQuestions.length &&
        !pendingCsvErrors.length
    ) {
        wrapper.classList.add("hidden");
        tableBody.innerHTML = "";
        importButton.disabled = true;
        return;
    }


    wrapper.classList.remove("hidden");
    summary.textContent = pendingCsvErrors.length
        ? `${pendingCsvQuestions.length} valid · ${pendingCsvErrors.length} error(s)`
        : `${pendingCsvQuestions.length} question(s) ready for room ${pendingCsvRoomKey}`;


    const previewRows = pendingCsvQuestions
        .slice(0, 10)
        .map((question, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${escapeHTML(question.text)}</td>
                <td>${escapeHTML(question.correctAnswer)}</td>
            </tr>
        `);
    const errorRows = pendingCsvErrors
        .slice(0, 5)
        .map(error => `
            <tr class="csv-row-error">
                <td>!</td>
                <td colspan="2">${escapeHTML(error)}</td>
            </tr>
        `);


    tableBody.innerHTML = [
        ...previewRows,
        ...errorRows
    ].join("");


    if (pendingCsvQuestions.length > 10) {
        tableBody.insertAdjacentHTML(
            "beforeend",
            `<tr><td colspan="3">…and ${pendingCsvQuestions.length - 10} more question(s)</td></tr>`
        );
    }


    importButton.disabled = Boolean(
        !pendingCsvQuestions.length ||
        pendingCsvErrors.length ||
        pendingCsvRoomKey !== activeRoomKey
    );
}


function clearCsvImport(message = "") {
    pendingCsvQuestions = [];
    pendingCsvErrors = [];
    pendingCsvRoomKey = "";


    const fileInput = document.getElementById(
        "csvFileInput"
    );


    if (fileInput) {
        fileInput.value = "";
    }


    renderCsvPreview();


    if (message) {
        setCsvImportMessage(message);
    }
}


async function handleCsvFile(file) {
    clearCsvImport();


    if (!activeRoomKey) {
        setCsvImportMessage(
            "Select an active room before choosing a CSV file.",
            true
        );
        return;
    }


    if (!file) {
        return;
    }


    if (
        !file.name.toLowerCase().endsWith(".csv") &&
        file.type !== "text/csv"
    ) {
        setCsvImportMessage(
            "Choose a file with the .csv extension.",
            true
        );
        return;
    }


    if (file.size > 1024 * 1024) {
        setCsvImportMessage(
            "The CSV is larger than the 1 MB limit.",
            true
        );
        return;
    }


    try {
        const rows = parseCsvRows(await file.text());
        const result = validateCsvRows(rows);


        pendingCsvQuestions = result.questions;
        pendingCsvErrors = result.errors;
        pendingCsvRoomKey = activeRoomKey;


        renderCsvPreview();


        if (pendingCsvErrors.length) {
            setCsvImportMessage(
                "Fix the listed CSV errors before importing. No questions have been uploaded.",
                true
            );
        }

        else {
            setCsvImportMessage(
                `${pendingCsvQuestions.length} question(s) are ready. Review the preview, then select Import Questions.`
            );
        }
    }

    catch (error) {
        console.error("CSV parsing failed:", error);
        setCsvImportMessage(
            error.message || "Unable to read this CSV file.",
            true
        );
    }
}


async function importCsvQuestions() {
    if (!hasAdminQuestionAccess()) {
        setCsvImportMessage(
            "Teacher / Admin access is required.",
            true
        );
        return;
    }


    if (
        !pendingCsvQuestions.length ||
        pendingCsvErrors.length ||
        pendingCsvRoomKey !== activeRoomKey
    ) {
        setCsvImportMessage(
            "Choose and validate a CSV file for the active room first.",
            true
        );
        return;
    }


    const importButton = document.getElementById(
        "importCsvButton"
    );
    const questionCount = pendingCsvQuestions.length;


    importButton.disabled = true;
    importButton.textContent = "Importing...";


    try {
        const updates = {};


        pendingCsvQuestions.forEach(question => {
            const questionReference = push(
                ref(database, "questions")
            );


            updates[`questions/${questionReference.key}`] = {
                ...question,
                roomKey: activeRoomKey,
                createdAt: serverTimestamp(),
                createdBy: currentUser.uid,
                updatedAt: serverTimestamp(),
                updatedBy: currentUser.uid
            };
        });


        await update(ref(database), updates);


        clearCsvImport(
            `${questionCount} question(s) were imported successfully into room ${activeRoomKey}.`
        );
    }

    catch (error) {
        console.error("Firebase CSV import failed:", error);
        setCsvImportMessage(
            "No questions were imported. Check your connection and Firebase question rules.",
            true
        );
    }

    finally {
        importButton.textContent = "Import Questions";
        renderCsvPreview();
    }
}


function downloadCsvTemplate() {
    const template = [
        "question,optionA,optionB,optionC,optionD,correctAnswer",
        '"What is 2 + 2?","3","4","5","6","B"',
        '"Which planet is known as the Red Planet?","Earth","Mars","Jupiter","Venus","B"'
    ].join("\r\n");
    const blob = new Blob(
        [template],
        { type: "text/csv;charset=utf-8" }
    );
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");


    link.href = downloadUrl;
    link.download = "tuklask-question-template.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
}


async function saveQuestion(event) {
    event.preventDefault();


    if (!hasAdminQuestionAccess()) {
        setQuestionMessage(
            "Administrator access is required.",
            true
        );

        return;
    }


    const question = getQuestionFormValues();
    const validationError =
        validateQuestion(question);


    if (validationError) {
        setQuestionMessage(
            validationError,
            true
        );

        return;
    }


    const saveButton =
        document.getElementById(
            "saveQuestionButton"
        );

    const isEditing =
        Boolean(editingQuestionId);


    saveButton.disabled = true;
    saveButton.textContent =
        isEditing
            ? "Saving Changes..."
            : "Adding Question...";

    setQuestionMessage("");


    try {
        if (isEditing) {
            const questionReference =
                ref(
                    database,
                    `questions/${editingQuestionId}`
                );


            await update(
                questionReference,
                {
                    ...question,
                    stage: null,
                    difficulty: null,
                    updatedAt: serverTimestamp(),
                    updatedBy: currentUser.uid
                }
            );
        }

        else {
            const questionReference =
                push(
                    ref(database, "questions")
                );


            await set(
                questionReference,
                {
                    ...question,
                    createdAt: serverTimestamp(),
                    createdBy: currentUser.uid,
                    updatedAt: serverTimestamp(),
                    updatedBy: currentUser.uid
                }
            );
        }


        resetQuestionForm();

        setQuestionMessage(
            isEditing
                ? "Question updated successfully."
                : "Question added successfully."
        );
    }

    catch (error) {
        console.error(
            "Firebase question save failed:",
            error
        );

        setQuestionMessage(
            "Unable to save the question. Check your connection and Firebase rules.",
            true
        );
    }

    finally {
        saveButton.disabled = false;
        saveButton.textContent =
            editingQuestionId
                ? "Save Changes"
                : "Add Question";
    }
}


function resetQuestionForm(clearMessage = true) {
    editingQuestionId = null;


    document
        .getElementById("questionForm")
        .reset();

    document
        .getElementById("questionFormHeading")
        .textContent = "Add Question";

    document
        .getElementById(
            "questionFormDescription"
        )
        .textContent =
            activeRoomKey
                ? `New questions will be added to room ${activeRoomKey}.`
                : "Select one of your rooms above to unlock this form.";

    document
        .getElementById("saveQuestionButton")
        .textContent = "Add Question";

    document
        .getElementById(
            "cancelQuestionEditButton"
        )
        .classList
        .add("hidden");


    if (clearMessage) {
        setQuestionMessage("");
    }
}


function populateQuestionFilters() {
    const roomKeySelect =
        document.getElementById(
            "questionRoomKeyFilter"
        );

    const selectedRoomKey =
        roomKeySelect.value;

    const roomKeys = [
        ...new Set(
            questions
                .map(question => question.roomKey)
                .filter(Boolean)
        )
    ].sort((a, b) => a.localeCompare(b));


    roomKeySelect.innerHTML =
        '<option value="all">All Room Keys</option>' +
        roomKeys
            .map(roomKey =>
                `<option value="${escapeHTML(roomKey)}">${escapeHTML(roomKey)}</option>`
            )
            .join("");


    roomKeySelect.value =
        roomKeys.includes(selectedRoomKey)
            ? selectedRoomKey
            : "all";
}


function getFilteredQuestions() {
    const search = document
        .getElementById("questionSearch")
        .value
        .trim()
        .toLowerCase();

    const roomKey = document
        .getElementById(
            "questionRoomKeyFilter"
        )
        .value;

    return questions
        .filter(question => {
            const searchableText = [
                question.text,
                question.roomKey,
                ...Object.values(question.options)
            ]
                .join(" ")
                .toLowerCase();


            const matchesSearch =
                !search ||
                searchableText.includes(search);

            const matchesRoomKey =
                roomKey === "all" ||
                question.roomKey === roomKey;


            return (
                matchesSearch &&
                matchesRoomKey
            );
        })
        .sort((a, b) =>
            a.roomKey.localeCompare(b.roomKey) ||
            a.text.localeCompare(b.text)
        );
}


function renderQuestions(errorMessage = "") {
    const tableBody =
        document.getElementById(
            "questionTable"
        );

    const filteredQuestions =
        getFilteredQuestions();

    const countElement =
        document.getElementById(
            "questionCount"
        );


    countElement.textContent =
        filteredQuestions.length === questions.length
            ? `${questions.length} ${questions.length === 1 ? "question" : "questions"}`
            : `${filteredQuestions.length} of ${questions.length}`;


    if (errorMessage) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="question-empty-state">
                    ${escapeHTML(errorMessage)}
                </td>
            </tr>
        `;

        return;
    }


    if (!filteredQuestions.length) {
        const emptyMessage = questions.length
            ? "No questions match the current filters."
            : "No questions have been added yet.";


        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="question-empty-state">
                    ${emptyMessage}
                </td>
            </tr>
        `;

        return;
    }


    tableBody.innerHTML =
        filteredQuestions
            .map(question => {
                const correctOption =
                    question.options[
                        question.correctAnswer
                    ] || "";


                return `
                    <tr>
                        <td class="question-text-cell">
                            ${escapeHTML(question.text)}
                            <small>
                                A: ${escapeHTML(question.options.A)} ·
                                B: ${escapeHTML(question.options.B)} ·
                                C: ${escapeHTML(question.options.C)} ·
                                D: ${escapeHTML(question.options.D)}
                            </small>
                        </td>
                        <td>
                            <span class="room-key-badge${question.roomKey ? "" : " unassigned"}">
                                ${escapeHTML(question.roomKey || "Unassigned")}
                            </span>
                        </td>
                        <td class="correct-cell">
                            ${escapeHTML(question.correctAnswer)}:
                            ${escapeHTML(correctOption)}
                        </td>
                        <td>
                            <div class="question-actions">
                                <button
                                    class="question-edit-button"
                                    type="button"
                                    data-question-action="edit"
                                    data-question-id="${escapeHTML(question.id)}"
                                >
                                    Edit
                                </button>
                                <button
                                    class="question-delete-button"
                                    type="button"
                                    data-question-action="delete"
                                    data-question-id="${escapeHTML(question.id)}"
                                >
                                    Delete
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            })
            .join("");
}


function editQuestion(questionId) {
    if (!hasAdminQuestionAccess()) {
        return;
    }


    const question = questions.find(
        item => item.id === questionId
    );


    if (!question) {
        setQuestionMessage(
            "That question is no longer available.",
            true
        );

        return;
    }


    if (
        question.roomKey &&
        question.roomKey !== activeRoomKey
    ) {
        setActiveRoomKey(
            question.roomKey,
            false,
            true
        );
    }


    if (!activeRoomKey) {
        setRoomKeyMessage(
            "Select a room before editing this unassigned question.",
            true
        );

        document
            .querySelector(".room-key-panel")
            .scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

        return;
    }


    editingQuestionId = question.id;


    document.getElementById("questionText").value =
        question.text;

    ["A", "B", "C", "D"].forEach(letter => {
        document
            .getElementById(
                `questionOption${letter}`
            )
            .value = question.options[letter];
    });

    document
        .getElementById("questionCorrectAnswer")
        .value = question.correctAnswer;

    document
        .getElementById("questionFormHeading")
        .textContent = "Edit Question";

    document
        .getElementById(
            "questionFormDescription"
        )
        .textContent =
            "Update this question without changing its database identity.";

    document
        .getElementById("saveQuestionButton")
        .textContent = "Save Changes";

    document
        .getElementById(
            "cancelQuestionEditButton"
        )
        .classList
        .remove("hidden");


    setQuestionMessage("");

    document
        .getElementById("questionForm")
        .scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
}


async function deleteQuestion(questionId) {
    if (!hasAdminQuestionAccess()) {
        setQuestionMessage(
            "Administrator access is required.",
            true
        );

        return;
    }


    const question = questions.find(
        item => item.id === questionId
    );


    if (!question) {
        setQuestionMessage(
            "That question is no longer available.",
            true
        );

        return;
    }


    const shouldDelete = window.confirm(
        `Delete this question?\n\n${question.text}`
    );


    if (!shouldDelete) {
        return;
    }


    try {
        await remove(
            ref(
                database,
                `questions/${questionId}`
            )
        );


        if (editingQuestionId === questionId) {
            resetQuestionForm();
        }

        setQuestionMessage(
            "Question deleted successfully."
        );
    }

    catch (error) {
        console.error(
            "Firebase question delete failed:",
            error
        );

        setQuestionMessage(
            "Unable to delete the question. Check your connection and Firebase rules.",
            true
        );
    }
}


document
    .getElementById("questionForm")
    .addEventListener(
        "submit",
        saveQuestion
    );


document
    .getElementById(
        "cancelQuestionEditButton"
    )
    .addEventListener(
        "click",
        () => resetQuestionForm()
    );


document
    .getElementById("questionSearch")
    .addEventListener(
        "input",
        () => renderQuestions()
    );


[
    "questionRoomKeyFilter"
].forEach(id => {
    document
        .getElementById(id)
        .addEventListener(
            "change",
            () => renderQuestions()
        );
});


document
    .getElementById("questionFilterReset")
    .addEventListener(
        "click",
        () => {
            document
                .getElementById("questionSearch")
                .value = "";

            document
                .getElementById(
                    "questionRoomKeyFilter"
                )
                .value = "all";

            renderQuestions();
        }
    );


document
    .getElementById("questionRoomKey")
    .addEventListener(
        "input",
        event => {
            event.target.value = event.target.value
                .toUpperCase()
                .replace(/\s+/g, "");
        }
    );


document
    .getElementById("activateRoomKeyButton")
    .addEventListener(
        "click",
        activateRoomKeyFromInput
    );


document
    .getElementById("questionRoomKey")
    .addEventListener(
        "keydown",
        event => {
            if (event.key === "Enter") {
                event.preventDefault();
                activateRoomKeyFromInput();
            }
        }
    );


document
    .getElementById("questionTable")
    .addEventListener(
        "click",
        event => {
            const button = event.target.closest(
                "[data-question-action]"
            );


            if (!button) {
                return;
            }


            const questionId =
                button.dataset.questionId;


            if (
                button.dataset.questionAction === "edit"
            ) {
                editQuestion(questionId);
            }

            else if (
                button.dataset.questionAction === "delete"
            ) {
                deleteQuestion(questionId);
            }
        }
    );


document
    .getElementById("questionActiveRoomSelect")
    .addEventListener(
        "change",
        event => {
            const roomKey = event.target.value;


            if (roomKey) {
                useOwnedRoom(roomKey, false);
            }

            else {
                clearActiveRoomKey();
            }
        }
    );


document
    .getElementById("openRoomManagementButton")
    .addEventListener(
        "click",
        () => showAdminSection("roomManagement")
    );


document
    .getElementById("roomTable")
    .addEventListener(
        "click",
        event => {
            const button = event.target.closest(
                "[data-room-action]"
            );


            if (!button) {
                return;
            }


            const roomKey = button.dataset.roomKey;


            if (button.dataset.roomAction === "use") {
                useOwnedRoom(roomKey);
            }

            else if (button.dataset.roomAction === "toggle") {
                toggleRoomStatus(roomKey);
            }

            else if (button.dataset.roomAction === "delete") {
                deleteRoom(roomKey);
            }
        }
    );


const csvDropZone = document.getElementById(
    "csvDropZone"
);
const csvFileInput = document.getElementById(
    "csvFileInput"
);


csvDropZone.addEventListener("click", event => {
    if (event.target === csvFileInput) {
        return;
    }


    csvFileInput.click();
});


csvDropZone.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        csvFileInput.click();
    }
});


["dragenter", "dragover"].forEach(eventName => {
    csvDropZone.addEventListener(eventName, event => {
        event.preventDefault();
        csvDropZone.classList.add("drag-over");
    });
});


["dragleave", "drop"].forEach(eventName => {
    csvDropZone.addEventListener(eventName, event => {
        event.preventDefault();
        csvDropZone.classList.remove("drag-over");
    });
});


csvDropZone.addEventListener("drop", event => {
    handleCsvFile(event.dataTransfer?.files?.[0]);
});


csvFileInput.addEventListener("change", event => {
    handleCsvFile(event.target.files?.[0]);
});


document
    .getElementById("downloadCsvTemplateButton")
    .addEventListener("click", downloadCsvTemplate);


document
    .getElementById("clearCsvButton")
    .addEventListener(
        "click",
        () => clearCsvImport(
            "CSV selection cleared."
        )
    );


document
    .getElementById("importCsvButton")
    .addEventListener("click", importCsvQuestions);


/* ==================================================
   STUDENT NAVIGATION
================================================== */

function showStudentSection(sectionId) {
    document
        .querySelectorAll(
            "#studentPage .content-section"
        )
        .forEach(section => {
            section.classList.remove("active");
        });


    document
        .getElementById(sectionId)
        .classList.add("active");


    document
        .querySelectorAll(".student-nav")
        .forEach(button => {
            button.classList.remove("active");
        });


    const activeButton =
        document.querySelector(
            `.student-nav[data-student-page="${sectionId}"]`
        );


    if (activeButton) {
        activeButton.classList.add("active");
    }


    closeAllSidebars();

    window.scrollTo(0, 0);
}


document
    .querySelectorAll(".student-nav")
    .forEach(button => {
        button.addEventListener(
            "click",
            () => {
                showStudentSection(
                    button.dataset.studentPage
                );
            }
        );
    });


/* ==================================================
   MOBILE SIDEBAR
================================================== */

document
    .querySelectorAll("[data-menu-target]")
    .forEach(button => {
        button.addEventListener(
            "click",
            () => {
                const sidebarId =
                    button.dataset.menuTarget;

                const sidebar =
                    document.getElementById(
                        sidebarId
                    );

                const overlay =
                    document.querySelector(
                        `[data-overlay="${sidebarId}"]`
                    );


                if (sidebar) {
                    sidebar.classList.add("open");
                }

                if (overlay) {
                    overlay.classList.add("visible");
                }
            }
        );
    });


document
    .querySelectorAll("[data-overlay]")
    .forEach(overlay => {
        overlay.addEventListener(
            "click",
            closeAllSidebars
        );
    });


function closeAllSidebars() {
    document
        .querySelectorAll(".sidebar")
        .forEach(sidebar => {
            sidebar.classList.remove("open");
        });


    document
        .querySelectorAll(".sidebar-overlay")
        .forEach(overlay => {
            overlay.classList.remove("visible");
        });
}


/* ==================================================
   ADMIN DASHBOARD
================================================== */

function renderAdminDashboard() {
    const generalTotal = generalKnowledgeStudents.length;
    const generalStages = generalKnowledgeStudents.reduce(
        (sum, student) => sum + getStagesCompleted(student),
        0
    );
    const generalLevels = generalKnowledgeStudents.reduce(
        (sum, student) => sum + student.progress.level,
        0
    );
    const generalExp = generalKnowledgeStudents.reduce(
        (sum, student) => sum + student.progress.exp,
        0
    );
    const generalAccuracy = generalKnowledgeStudents.reduce(
        (sum, student) => sum + calculateAccuracy(student),
        0
    );

    const learningTotal = learningBasedStudents.length;
    const learningInProgress = learningBasedStudents.filter(
        student => student.status !== "completed"
    ).length;
    const learningCompleted = learningBasedStudents.filter(
        student => student.status === "completed"
    ).length;
    const learningAnswered = learningBasedStudents.reduce(
        (sum, student) =>
            sum +
            student.statistics.correctAnswers +
            student.statistics.wrongAnswers,
        0
    );

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    };

    setText("generalTotalStudents", generalTotal);
    setText("generalStagesCompleted", generalStages);
    setText(
        "generalAverageLevel",
        generalTotal ? (generalLevels / generalTotal).toFixed(1) : "0.0"
    );
    setText(
        "generalAverageExp",
        generalTotal ? Math.round(generalExp / generalTotal) : 0
    );
    setText(
        "generalAverageAccuracy",
        `${generalTotal ? Math.round(generalAccuracy / generalTotal) : 0}%`
    );
    setText("learningTotalStudents", learningTotal);
    setText("learningInProgress", learningInProgress);
    setText("learningCompleted", learningCompleted);
    setText("learningAnswered", learningAnswered);


    renderTopPlayers();
}


/* ==================================================
   TOP PLAYERS
================================================== */

function renderTopPlayers() {
    const container =
        document.getElementById(
            "topPlayers"
        );


    container.innerHTML = "";


    if (generalKnowledgeStudents.length === 0) {
        container.innerHTML =
            "<p>No students are assigned to your rooms yet.</p>";

        return;
    }


    generalKnowledgeStudents
        .slice(0, 5)
        .forEach(student => {
            const row =
                document.createElement("div");

            row.className = "top-player";


            row.innerHTML = `
                <div class="top-rank">
                    #${student.rank}
                </div>

                <div class="top-info">
                    <strong>
                        ${escapeHTML(
                            student.nickname
                        )}
                    </strong>

                    <p>
                        Level ${student.progress.level}
                        ·
                        Stage ${student.progress.currentStage}
                    </p>
                </div>

                <div class="top-exp">
                    ${formatNumber(
                        student.progress.exp
                    )}
                    EXP
                </div>
            `;


            container.appendChild(row);
        });
}


/* ==================================================
   FILTER OPTIONS
================================================== */

function populateAllFilters() {
    const learningLevels = [
        ...new Set(
            learningBasedStudents.map(
                student =>
                    student.progress.level
            )
        )
    ].sort((a, b) => a - b);

    const learningSections = [
        ...new Set(
            learningBasedStudents.map(
                student =>
                    student.yearSection
            )
        )
    ].sort();

    const generalLevels = [
        ...new Set(
            generalKnowledgeStudents.map(
                student => student.progress.level
            )
        )
    ].sort((a, b) => a - b);

    const generalSections = [
        ...new Set(
            generalKnowledgeStudents.map(
                student => student.yearSection
            )
        )
    ].sort();

    const learningRoomKeys = [
        ...new Set(
            learningBasedStudents
                .map(student => student.roomKey)
                .filter(Boolean)
        )
    ].sort();

    populateSelect(
        "managementLevel",
        learningLevels,
        "All Levels",
        value => `Level ${value}`
    );

    populateSelect(
        "studentLeaderboardLevel",
        generalLevels,
        "All Levels",
        value => `Level ${value}`
    );

    populateSelect(
        "managementSection",
        learningSections,
        "All Sections"
    );

    populateSelect(
        "adminLeaderboardSection",
        learningSections,
        "All Sections"
    );

    populateSelect(
        "adminLeaderboardRoom",
        learningRoomKeys,
        "All My Rooms"
    );

    populateSelect(
        "studentLeaderboardSection",
        generalSections,
        "All Sections"
    );

    populateSelect(
        "studentLeaderboardRoom",
        studentRoomHistory.map(room => room.roomKey),
        "All Joined Rooms",
        value => {
            const membership = studentRoomHistory.find(
                room => room.roomKey === value
            );
            const teacher = membership?.teacherName;
            return teacher ? `${value} — ${teacher}` : value;
        }
    );
}


function populateSelect(
    id,
    values,
    defaultLabel,
    formatter = value => value
) {
    const select =
        document.getElementById(id);


    if (!select) {
        return;
    }


    const previousValue =
        select.value;


    select.innerHTML = `
        <option value="all">
            ${defaultLabel}
        </option>
    `;


    values.forEach(value => {
        const option =
            document.createElement(
                "option"
            );

        option.value =
            String(value);

        option.textContent =
            formatter(value);

        select.appendChild(option);
    });


    const optionStillExists =
        Array.from(select.options)
            .some(
                option =>
                    option.value ===
                    previousValue
            );


    if (optionStillExists) {
        select.value =
            previousValue;
    }
}


/* ==================================================
   STUDENT MANAGEMENT
================================================== */

const managementSearch =
    document.getElementById(
        "managementSearch"
    );

const managementLevel =
    document.getElementById(
        "managementLevel"
    );

const managementSection =
    document.getElementById(
        "managementSection"
    );


managementSearch.addEventListener(
    "input",
    renderStudentManagement
);

managementLevel.addEventListener(
    "change",
    renderStudentManagement
);

managementSection.addEventListener(
    "change",
    renderStudentManagement
);


document
    .getElementById("managementReset")
    .addEventListener(
        "click",
        () => {
            managementSearch.value = "";
            managementLevel.value = "all";
            managementSection.value = "all";

            renderStudentManagement();
        }
    );


function renderStudentManagement() {
    const search =
        managementSearch
            .value
            .trim()
            .toLowerCase();

    const level =
        managementLevel.value;

    const section =
        managementSection.value;


    const filtered =
        learningBasedStudents.filter(student => {
            const matchesSearch =
                student.nickname
                    .toLowerCase()
                    .includes(search)

                ||

                student.studentNumber
                    .toLowerCase()
                    .includes(search);


            const matchesLevel =
                level === "all"

                ||

                String(
                    student.progress.level
                ) === level;


            const matchesSection =
                section === "all"

                ||

                student.yearSection ===
                section;


            return (
                matchesSearch &&
                matchesLevel &&
                matchesSection
            );
        });


    const tbody =
        document.getElementById(
            "managementTable"
        );


    tbody.innerHTML = "";


    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    No students found.
                </td>
            </tr>
        `;

        return;
    }


    filtered.forEach(student => {
        const row =
            document.createElement("tr");


        row.innerHTML = `
            <td class="nickname-cell">
                ${escapeHTML(
                    student.nickname
                )}
            </td>

            <td>
                ${escapeHTML(
                    student.studentNumber
                )}
            </td>

            <td>
                <span class="room-key-badge">
                    ${escapeHTML(
                        student.roomKey
                    )}
                </span>
            </td>

            <td>
                ${escapeHTML(
                    student.yearSection
                )}
            </td>

            <td>
                ${student.progress.currentStage}
            </td>

            <td class="level-cell">
                ${student.progress.level}
            </td>

            <td class="exp-cell">
                ${formatNumber(
                    student.progress.exp
                )}
            </td>

            <td>
                <button
                    class="view-button"
                    data-student-id="${escapeHTML(
                        student.membershipId || student.uid
                    )}"
                >
                    View
                </button>
            </td>
        `;


        tbody.appendChild(row);
    });


    document
        .querySelectorAll(
            "[data-student-id]"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    showStudentDetails(
                        button.dataset.studentId
                    );
                }
            );
        });
}


/* ==================================================
   STUDENT DETAILS
================================================== */

function showStudentDetails(uid) {
    const student =
        learningBasedStudents.find(
            student =>
                (student.membershipId || student.uid) === uid
        );


    if (!student) {
        return;
    }


    document
        .getElementById(
            "studentDetailsPanel"
        )
        .classList.remove("hidden");


    document
        .getElementById(
            "detailNickname"
        )
        .textContent =
            student.nickname;


    document
        .getElementById(
            "detailEmail"
        )
        .textContent =
            student.email;


    document
        .getElementById(
            "detailStudentNumber"
        )
        .textContent =
            student.studentNumber;


    document
        .getElementById(
            "detailSection"
        )
        .textContent =
            student.yearSection;


    document
        .getElementById(
            "detailRoomKey"
        )
        .textContent =
            student.roomKey || "Not assigned";


    document
        .getElementById(
            "detailStage"
        )
        .textContent =
            student.progress.currentStage;


    document
        .getElementById(
            "detailLevel"
        )
        .textContent =
            student.progress.level;


    document
        .getElementById(
            "detailExp"
        )
        .textContent =
            formatNumber(
                student.progress.exp
            );


    document
        .getElementById(
            "detailCorrect"
        )
        .textContent =
            student.statistics.correctAnswers;


    document
        .getElementById(
            "detailWrong"
        )
        .textContent =
            student.statistics.wrongAnswers;


    document
        .getElementById(
            "detailResult"
        )
        .textContent =
            `${calculateAccuracy(student)}%`;


    document
        .getElementById(
            "studentDetailsPanel"
        )
        .scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
}


document
    .getElementById(
        "closeStudentDetails"
    )
    .addEventListener(
        "click",
        () => {
            document
                .getElementById(
                    "studentDetailsPanel"
                )
                .classList.add("hidden");
        }
    );


/* ==================================================
   LEADERBOARD FILTER

   The students array contains room-only results for
   Admin and global results for the Student view.
================================================== */

function getFilteredLeaderboard(role) {
    const search =
        document
            .getElementById(
                `${role}LeaderboardSearch`
            )
            .value
            .trim()
            .toLowerCase();


    const level =
        document
            .getElementById(
                `${role}LeaderboardLevel`
            )
            .value;


    const section =
        document
            .getElementById(
                `${role}LeaderboardSection`
            )
            .value;


    const roomKey =
        role === "admin"
            ? document
                .getElementById(
                    "adminLeaderboardRoom"
                )
                .value
            : "all";


    const sort =
        document
            .getElementById(
                `${role}LeaderboardSort`
            )
            .value;


    const top =
        document
            .getElementById(
                `${role}LeaderboardTop`
            )
            .value;


    let result =
        students.filter(student => {
            const matchesSearch =
                student.nickname
                    .toLowerCase()
                    .includes(search)

                ||

                student.studentNumber
                    .toLowerCase()
                    .includes(search);


            const matchesLevel =
                level === "all"

                ||

                String(
                    student.progress.level
                ) === level;


            const matchesSection =
                section === "all"

                ||

                student.yearSection ===
                section;


            const matchesRoomKey =
                roomKey === "all"

                ||

                student.roomKey === roomKey;


            return (
                matchesSearch &&
                matchesLevel &&
                matchesSection &&
                matchesRoomKey
            );
        });


    result = [...result];


    switch (sort) {
        case "expHigh":
            result.sort(
                (a, b) =>
                    b.progress.exp -
                    a.progress.exp
            );
            break;


        case "expLow":
            result.sort(
                (a, b) =>
                    a.progress.exp -
                    b.progress.exp
            );
            break;


        case "levelHigh":
            result.sort(
                (a, b) =>
                    b.progress.level -
                    a.progress.level
            );
            break;


        case "levelLow":
            result.sort(
                (a, b) =>
                    a.progress.level -
                    b.progress.level
            );
            break;


        case "nameAZ":
            result.sort(
                (a, b) =>
                    a.nickname.localeCompare(
                        b.nickname
                    )
            );
            break;


        case "nameZA":
            result.sort(
                (a, b) =>
                    b.nickname.localeCompare(
                        a.nickname
                    )
            );
            break;


        default:
            result.sort(
                (a, b) =>
                    a.rank - b.rank
            );
            break;
    }


    if (top !== "all") {
        result =
            result.slice(
                0,
                Number(top)
            );
    }


    return result;
}


/* ==================================================
   ADMIN LEADERBOARD
================================================== */

function getAdminLearningLeaderboard() {
    const search = document
        .getElementById("adminLeaderboardSearch")
        .value.trim().toLowerCase();
    const status = document
        .getElementById("adminLeaderboardLevel")
        .value;
    const section = document
        .getElementById("adminLeaderboardSection")
        .value;
    const roomKey = document
        .getElementById("adminLeaderboardRoom")
        .value;
    const sort = document
        .getElementById("adminLeaderboardSort")
        .value;
    const top = document
        .getElementById("adminLeaderboardTop")
        .value;

    let result = learningBasedStudents.filter(student => {
        const searchable = [
            student.fullName,
            student.nickname,
            student.studentNumber
        ].join(" ").toLowerCase();

        return (
            searchable.includes(search) &&
            (status === "all" || student.status === status) &&
            (section === "all" || student.yearSection === section) &&
            (roomKey === "all" || student.roomKey === roomKey)
        );
    });

    result = [...result];

    switch (sort) {
        case "answeredHigh":
            result.sort((a, b) =>
                (b.statistics.correctAnswers + b.statistics.wrongAnswers) -
                (a.statistics.correctAnswers + a.statistics.wrongAnswers)
            );
            break;
        case "correctHigh":
            result.sort((a, b) =>
                b.statistics.correctAnswers - a.statistics.correctAnswers
            );
            break;
        case "completedFirst":
            result = calculateLearningRanking(result);
            break;
        case "nameAZ":
            result.sort((a, b) =>
                (a.fullName || a.nickname).localeCompare(
                    b.fullName || b.nickname
                )
            );
            break;
        case "nameZA":
            result.sort((a, b) =>
                (b.fullName || b.nickname).localeCompare(
                    a.fullName || a.nickname
                )
            );
            break;
        default:
            result.sort((a, b) => a.rank - b.rank);
    }

    result = result.map((student, index) => ({
        ...student,
        displayRank: index + 1
    }));

    return top === "all"
        ? result
        : result.slice(0, Number(top));
}


function getStudentLeaderboardMode() {
    return document.getElementById("studentLeaderboardMode")?.value ||
        "general";
}


function getStudentGeneralLeaderboard() {
    const search = document
        .getElementById("studentLeaderboardSearch")
        .value.trim().toLowerCase();
    const level = document
        .getElementById("studentLeaderboardLevel")
        .value;
    const section = document
        .getElementById("studentLeaderboardSection")
        .value;
    const sort = document
        .getElementById("studentLeaderboardSort")
        .value;
    const top = document
        .getElementById("studentLeaderboardTop")
        .value;

    let result = generalKnowledgeStudents.filter(student =>
        [student.nickname, student.studentNumber]
            .join(" ").toLowerCase().includes(search) &&
        (level === "all" || String(student.progress.level) === level) &&
        (section === "all" || student.yearSection === section)
    );

    result = [...result];

    switch (sort) {
        case "expHigh":
            result.sort((a, b) => b.progress.exp - a.progress.exp);
            break;
        case "expLow":
            result.sort((a, b) => a.progress.exp - b.progress.exp);
            break;
        case "levelHigh":
            result.sort((a, b) => b.progress.level - a.progress.level);
            break;
        case "levelLow":
            result.sort((a, b) => a.progress.level - b.progress.level);
            break;
        case "nameAZ":
            result.sort((a, b) => a.nickname.localeCompare(b.nickname));
            break;
        case "nameZA":
            result.sort((a, b) => b.nickname.localeCompare(a.nickname));
            break;
        default:
            result.sort((a, b) => a.rank - b.rank);
    }

    return top === "all"
        ? result
        : result.slice(0, Number(top));
}


function getStudentLearningLeaderboard() {
    const search = document
        .getElementById("studentLeaderboardSearch")
        .value.trim().toLowerCase();
    const selectedRoom = document
        .getElementById("studentLeaderboardRoom")
        .value;
    const top = document
        .getElementById("studentLeaderboardTop")
        .value;

    const lists = selectedRoom === "all"
        ? [...studentLearningLeaderboardsByRoom.values()]
        : [studentLearningLeaderboardsByRoom.get(selectedRoom) || []];

    const unique = new Map();
    lists.flat().forEach(student => {
        unique.set(student.membershipId, student);
    });

    let result = calculateLearningRanking(
        [...unique.values()].filter(student =>
            [student.fullName, student.nickname]
                .join(" ").toLowerCase().includes(search)
        )
    );

    if (top !== "all") {
        result = result.slice(0, Number(top));
    }

    return result;
}

function renderAdminLeaderboard() {
    const list =
        getAdminLearningLeaderboard();

    const tbody =
        document.getElementById(
            "adminLeaderboardTable"
        );


    tbody.innerHTML = "";


    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10">
                    No players found.
                </td>
            </tr>
        `;

        return;
    }


    list.forEach(student => {
        const row =
            document.createElement("tr");


        row.innerHTML = `
            <td class="rank-cell">
                #${student.displayRank || student.rank}
            </td>

            <td class="nickname-cell">
                ${escapeHTML(
                    student.fullName || "Not provided"
                )}
            </td>

            <td>
                ${escapeHTML(
                    student.studentNumber
                )}
            </td>

            <td>
                ${escapeHTML(student.nickname)}
            </td>

            <td>
                ${escapeHTML(student.yearSection)}
            </td>

            <td>
                <span class="room-key-badge">
                    ${escapeHTML(student.roomKey)}
                </span>
            </td>

            <td>
                <span class="status-badge ${
                    student.status === "completed"
                        ? "status-completed"
                        : "status-progress"
                }">
                    ${student.status === "completed"
                        ? "Completed"
                        : "In Progress"}
                </span>
            </td>

            <td class="correct-cell">
                ${student.statistics.correctAnswers}
            </td>

            <td class="wrong-cell">
                ${student.statistics.wrongAnswers}
            </td>

            <td>
                ${
                    student.statistics.correctAnswers +
                    student.statistics.wrongAnswers
                }
            </td>
        `;


        tbody.appendChild(row);
    });
}


/* ==================================================
   STUDENT LEADERBOARD

   Uses the existing global student ranking.

   Students see:
   - Rank
   - Nickname
   - Section
   - Level
   - EXP
   - Stage

   Current logged-in student is highlighted.
================================================== */

function renderStudentLeaderboard() {
    const mode = getStudentLeaderboardMode();
    const list = mode === "learning"
        ? getStudentLearningLeaderboard()
        : getStudentGeneralLeaderboard();

    const tbody =
        document.getElementById(
            "studentLeaderboardTable"
        );

    const head = document.getElementById(
        "studentLeaderboardHead"
    );

    const roomField = document.getElementById(
        "studentLeaderboardRoomField"
    );

    if (roomField) {
        roomField.classList.toggle("hidden", mode !== "learning");
    }

    [
        "studentLeaderboardLevelField",
        "studentLeaderboardSectionField",
        "studentLeaderboardSortField"
    ].forEach(id => {
        document
            .getElementById(id)
            ?.classList.toggle("hidden", mode === "learning");
    });

    if (head) {
        head.innerHTML = mode === "learning"
            ? `
                <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Section / Year</th>
                    <th>Status</th>
                </tr>
            `
            : `
                <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Section</th>
                    <th>Level</th>
                    <th>EXP</th>
                    <th>Stage</th>
                </tr>
            `;
    }


    tbody.innerHTML = "";


    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${mode === "learning" ? 4 : 6}">
                    No players found.
                </td>
            </tr>
        `;

        return;
    }


    list.forEach(student => {
        const row =
            document.createElement("tr");


        if (
            currentUser?.uid ===
            student.uid
        ) {
            row.classList.add(
                "current-user-row"
            );
        }


        row.innerHTML = mode === "learning"
            ? `
                <td class="rank-cell">#${student.rank}</td>
                <td class="nickname-cell">
                    ${escapeHTML(student.nickname)}
                </td>
                <td>${escapeHTML(student.yearSection)}</td>
                <td>
                    <span class="status-badge ${
                        student.status === "completed"
                            ? "status-completed"
                            : "status-progress"
                    }">
                        ${student.status === "completed"
                            ? "Completed"
                            : "In Progress"}
                    </span>
                </td>
            `
            : `
                <td class="rank-cell">#${student.rank}</td>
                <td class="nickname-cell">
                    ${escapeHTML(student.nickname)}
                </td>
                <td>${escapeHTML(student.yearSection)}</td>
                <td class="level-cell">${student.progress.level}</td>
                <td class="exp-cell">${formatNumber(student.progress.exp)}</td>
                <td>${student.progress.currentStage}</td>
            `;


        tbody.appendChild(row);
    });
}


/* ==================================================
   LEADERBOARD EVENTS
================================================== */

[
    "admin",
    "student"
]
.forEach(role => {
    const ids = [
        `${role}LeaderboardSearch`,
        `${role}LeaderboardLevel`,
        `${role}LeaderboardSection`,
        `${role}LeaderboardSort`,
        `${role}LeaderboardTop`
    ];


    if (role === "admin") {
        ids.push("adminLeaderboardRoom");
    }

    else {
        ids.push(
            "studentLeaderboardMode",
            "studentLeaderboardRoom"
        );
    }


    ids.forEach(id => {
        const element =
            document.getElementById(id);


        if (!element) {
            return;
        }


        const eventType =
            element.tagName === "INPUT"
                ? "input"
                : "change";


        element.addEventListener(
            eventType,
            () => {
                if (role === "admin") {
                    renderAdminLeaderboard();
                }

                else {
                    renderStudentLeaderboard();
                }
            }
        );
    });


    const resetButton =
        document.getElementById(
            `${role}LeaderboardReset`
        );


    if (resetButton) {
        resetButton.addEventListener(
            "click",
            () => {
                document
                    .getElementById(
                        `${role}LeaderboardSearch`
                    )
                    .value = "";


                document
                    .getElementById(
                        `${role}LeaderboardLevel`
                    )
                    .value = "all";


                document
                    .getElementById(
                        `${role}LeaderboardSection`
                    )
                    .value = "all";


                if (role === "admin") {
                    document
                        .getElementById(
                            "adminLeaderboardRoom"
                        )
                        .value = "all";
                }

                else {
                    document
                        .getElementById("studentLeaderboardMode")
                        .value = "general";

                    document
                        .getElementById("studentLeaderboardRoom")
                        .value = "all";
                }


                document
                    .getElementById(
                        `${role}LeaderboardSort`
                    )
                    .value = "ranking";


                document
                    .getElementById(
                        `${role}LeaderboardTop`
                    )
                    .value = "all";


                if (role === "admin") {
                    renderAdminLeaderboard();
                }

                else {
                    renderStudentLeaderboard();
                }
            }
        );
    }
});


/* ==================================================
   CURRENT STUDENT
================================================== */

function renderStudentRoomHistory() {
    const container = document.getElementById(
        "studentRoomHistoryList"
    );
    const message = document.getElementById(
        "studentRoomHistoryMessage"
    );

    if (!container || !message) {
        return;
    }

    container.innerHTML = "";
    message.textContent = "";

    if (currentRole !== "student") {
        return;
    }

    if (!studentRoomHistory.length) {
        message.textContent = studentRoomHistoryDiscoveryLimited
            ? "Room history is unavailable until Firebase allows signed-in users to list room keys."
            : "No Learning-Based room history was found for this account.";
        return;
    }

    if (studentRoomHistoryDiscoveryLimited) {
        message.textContent =
            "Showing known rooms only. Allow signed-in users to list room keys to display complete history.";
    }

    studentRoomHistory.forEach(membership => {
        const button = document.createElement("button");
        const isCurrent =
            membership.roomKey === normalizeRoomKey(currentUser.roomKey);
        const isSelected =
            membership.roomKey === selectedStudentRoomKey;

        button.type = "button";
        button.className = `room-history-item${
            isSelected ? " active" : ""
        }`;
        button.dataset.roomKey = membership.roomKey;
        button.innerHTML = `
            <span class="room-history-main">
                <strong>${escapeHTML(membership.roomKey)}</strong>
                <small>
                    ${escapeHTML(membership.teacherName || "Teacher not listed")}
                    · ${escapeHTML(membership.yearSection)}
                </small>
            </span>
            <span class="room-history-meta">
                ${isCurrent ? "Current · " : ""}${
                    membership.status === "completed"
                        ? "Completed"
                        : "In Progress"
                }
            </span>
        `;

        button.addEventListener("click", () => {
            selectStudentRoom(membership.roomKey);
        });

        container.appendChild(button);
    });
}

function renderCurrentStudent() {
    if (
        currentRole !== "student" ||
        !currentUser?.uid
    ) {
        return;
    }


    const profile = generalKnowledgeStudents.find(
        student => student.uid === currentUser.uid
    );
    const learning = currentRoomMembership ||
        studentRoomHistory.find(
            room => room.roomKey === selectedStudentRoomKey
        ) || null;
    const playerName =
        profile?.nickname ||
        currentUser.profile?.nickname ||
        learning?.nickname ||
        "Tuklask User";
    const firstLetter = playerName.charAt(0).toUpperCase();


    const profileInitial =
        document.querySelector(
            "#studentPage .profile-initial"
        );


    if (profileInitial) {
        profileInitial.textContent =
            firstLetter;
    }


    document
        .getElementById("studentName")
        .textContent =
            playerName;


    document
        .getElementById("studentEmail")
        .textContent =
            currentUser.email || profile?.email || "";


    document
        .getElementById("studentLevel")
        .textContent =
            profile?.progress.level || 0;


    document
        .getElementById("studentExp")
        .textContent =
            formatNumber(
                profile?.progress.exp || 0
            );


    document
        .getElementById("studentStage")
        .textContent =
            profile?.progress.currentStage || 0;


    document
        .getElementById("progressStage")
        .textContent =
            profile?.progress.currentStage || 0;


    document
        .getElementById("progressLevel")
        .textContent =
            profile?.statistics.correctAnswers || 0;


    document
        .getElementById("progressExp")
        .textContent =
            profile?.statistics.wrongAnswers || 0;


    document
        .getElementById(
            "progressCompleted"
        )
        .textContent =
            profile ? getStagesCompleted(profile) : 0;


    document
        .getElementById("quizCorrect")
        .textContent =
            learning?.statistics.correctAnswers || 0;


    document
        .getElementById("quizWrong")
        .textContent =
            learning?.statistics.wrongAnswers || 0;


    document
        .getElementById("quizResult")
        .textContent =
            `${learning ? calculateAccuracy(learning) : 0}%`;


    document
        .getElementById("recordRoomKey")
        .textContent =
            learning?.roomKey ||
            "-";

    document
        .getElementById("recordTeacherName")
        .textContent = learning?.teacherName || "-";

    document
        .getElementById("recordYearSection")
        .textContent = learning?.yearSection || "-";

    document
        .getElementById("recordStatus")
        .textContent = learning
            ? (learning.status === "completed"
                ? "Completed"
                : "In Progress")
            : "Not started";


    document
        .getElementById("recordTotalQuestions")
        .textContent =
            learning?.totalQuestions ||
            (
                (learning?.statistics.correctAnswers || 0) +
                (learning?.statistics.wrongAnswers || 0)
            );


    document
        .getElementById("recordCompletedAt")
        .textContent = learning?.completedAt
            ? new Date(
                learning.completedAt
            ).toLocaleString()
            : "Not completed";
}


/* ==================================================
   CONTINUE / END
================================================== */

const continueModal =
    document.getElementById(
        "continueModal"
    );


document
    .getElementById(
        "adminContinueButton"
    )
    .addEventListener(
        "click",
        openContinueModal
    );


document
    .getElementById(
        "studentContinueButton"
    )
    .addEventListener(
        "click",
        openContinueModal
    );


function openContinueModal() {
    closeAllSidebars();

    continueModal
        .classList
        .remove("hidden");
}


document
    .getElementById("continueYes")
    .addEventListener(
        "click",
        async () => {
            continueModal
                .classList
                .add("hidden");

            await logoutToLogin();
        }
    );


document
    .getElementById("continueNo")
    .addEventListener(
        "click",
        async () => {
            continueModal
                .classList
                .add("hidden");


            stopFirebaseListeners();


            try {
                await signOut(auth);
            }

            catch (error) {
                console.error(
                    "Firebase sign out error:",
                    error
                );
            }


            currentUser = null;
            currentRole = null;
            students = [];
            generalKnowledgeStudents = [];
            learningBasedStudents = [];


            showPage("endPage");
        }
    );


document
    .getElementById("restartButton")
    .addEventListener(
        "click",
        logoutToLogin
    );


/* ==================================================
   INITIAL DISPLAY

   IMPORTANT:
   We do NOT read Firebase /users here.

   Firebase data is loaded only after successful login.
================================================== */

renderEverything();
