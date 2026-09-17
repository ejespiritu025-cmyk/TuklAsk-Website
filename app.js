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
    signOut
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
let unsubscribeUsers = null;
let unsubscribeOwnedRooms = null;
let unsubscribeAdminRoomUsers = [];
let adminRoomStudentGroups = new Map();
let ownedRoomKeys = [];
let ownedRooms = [];
let questions = [];
let editingQuestionId = null;
let unsubscribeQuestions = null;
let unsubscribeStudentRoom = null;
let currentRoomMembership = null;
let activeRoomKey = "";


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
        progress.currentStage ||
        (member?.status === "completed"
            ? 3
            : monstersDefeated + 1)
    );


    return {
        uid,
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
        status: String(
            member?.status || "in_progress"
        ),
        joinedAt: Number(member?.joinedAt || 0),
        completedAt: Number(result.completedAt || 0),
        monstersDefeated,
        totalQuestions: Number(
            result.totalQuestions || correct + wrong
        ),
        progress: {
            currentStage,
            exp: Number(progress.exp || correct * 100),
            level: Number(
                progress.level || monstersDefeated + 1
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

        await updateProfile(
            credential.user,
            {
                displayName: fullName
            }
        );

        await signOut(auth);


        document
            .getElementById("loginEmail")
            .value = email;

        document
            .getElementById("loginRole")
            .value = "admin";

        document
            .getElementById("registerPassword")
            .value = "";

        document
            .getElementById("registerConfirmPassword")
            .value = "";


        showLoginPage(
            "Account created. You can now sign in as Teacher / Admin."
        );
    }

    catch (error) {
        console.error(
            "Firebase registration error:",
            error
        );


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

    const selectedRole =
        document
            .getElementById("loginRole")
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


    if (!selectedRole) {
        errorElement.textContent =
            "Select your role.";

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


        /* ==================================================
           ADMIN LOGIN
        ================================================== */

        if (selectedRole === "admin") {
            currentUser = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || email,
                displayName:
                    firebaseUser.displayName || "",
                accountType: "admin"
            };

            currentRole = "admin";


            document
                .getElementById("roomTeacherName")
                .value = currentUser.displayName;


            showAdminSection(
                "adminDashboard"
            );

            showPage(
                "adminPage"
            );


            /*
               Admin listens to members of owned rooms.
            */

            startUsersListener();
            startQuestionsListener();

            return;
        }


        /* ==================================================
           STUDENT LOGIN
        ================================================== */

        if (selectedRole === "student") {
            /*
               First verify that this Firebase Auth account
               has a Tuklask student profile.
            */

            const studentReference =
                ref(
                    database,
                    `users/${firebaseUser.uid}`
                );

            const studentSnapshot =
                await get(studentReference);


            if (!studentSnapshot.exists()) {
                await signOut(auth);

                errorElement.textContent =
                    "No Tuklask student profile was found for this account.";

                return;
            }


            currentUser = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || email,
                roomKey: normalizeRoomKey(
                    studentSnapshot.val()?.roomKey || ""
                ),
                studentNumber: String(
                    studentSnapshot.val()?.studentNumber || ""
                ),
                accountType: "student"
            };

            currentRole = "student";


            showStudentSection(
                "studentDashboard"
            );

            showPage(
                "studentPage"
            );


            /*
               Student now reads the same /users data
               used by the Admin leaderboard.

               This allows:
               - all-player ranking
               - Top 5 / Top 10
               - EXP sorting
               - Level sorting
               - section filtering
               - searching
               - current-player highlighting
            */

            startUsersListener();
            startStudentRoomListener(
                currentUser.roomKey,
                currentUser.studentNumber
            );

            return;
        }
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
                                        normalizeRoomMember(
                                            uid,
                                            roomKey,
                                            user
                                        )
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
                });
            },

            error => {
                console.error(
                    "Firebase owned rooms read failed:",
                    error
                );

                students = [];
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


    students = calculateGlobalRanking(
        [...uniqueStudents.values()]
    );

    renderEverything();
    renderRooms();
}


function stopAdminRoomUserListeners() {
    unsubscribeAdminRoomUsers
        .forEach(unsubscribe => unsubscribe());

    unsubscribeAdminRoomUsers = [];
    adminRoomStudentGroups.clear();
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

            renderCurrentStudent();
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
    questions = [];
    clearActiveRoomKey();


    document
        .getElementById("loginEmail")
        .value = "";

    document
        .getElementById("loginPassword")
        .value = "";

    document
        .getElementById("loginRole")
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
    const total =
        students.length;


    const active =
        students.filter(student => {
            if (student.status) {
                return student.status === "in_progress";
            }


            return (
                student.progress.exp > 0 ||
                student.progress.currentStage > 0 ||
                student.statistics.correctAnswers > 0 ||
                student.statistics.wrongAnswers > 0
            );
        }).length;


    const totalStages =
        students.reduce(
            (sum, student) =>
                sum +
                getStagesCompleted(student),
            0
        );


    const totalLevel =
        students.reduce(
            (sum, student) =>
                sum +
                student.progress.level,
            0
        );


    const totalExp =
        students.reduce(
            (sum, student) =>
                sum +
                student.progress.exp,
            0
        );


    const averageLevel =
        total > 0
            ? totalLevel / total
            : 0;


    const averageExp =
        total > 0
            ? totalExp / total
            : 0;


    document
        .getElementById("totalStudents")
        .textContent =
            total;

    document
        .getElementById("activeStudents")
        .textContent =
            active;

    document
        .getElementById("totalStagesCompleted")
        .textContent =
            totalStages;

    document
        .getElementById("averageLevel")
        .textContent =
            averageLevel.toFixed(1);

    document
        .getElementById("averageExp")
        .textContent =
            Math.round(averageExp);


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


    if (students.length === 0) {
        container.innerHTML =
            "<p>No students are assigned to your rooms yet.</p>";

        return;
    }


    students
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
    const levels = [
        ...new Set(
            students.map(
                student =>
                    student.progress.level
            )
        )
    ].sort((a, b) => a - b);


    const sections = [
        ...new Set(
            students.map(
                student =>
                    student.yearSection
            )
        )
    ].sort();


    const roomKeys = [
        ...new Set(
            students
                .map(student => student.roomKey)
                .filter(Boolean)
        )
    ].sort();


    populateSelect(
        "managementLevel",
        levels,
        "All Levels",
        value => `Level ${value}`
    );


    populateSelect(
        "adminLeaderboardLevel",
        levels,
        "All Levels",
        value => `Level ${value}`
    );


    populateSelect(
        "studentLeaderboardLevel",
        levels,
        "All Levels",
        value => `Level ${value}`
    );


    populateSelect(
        "managementSection",
        sections,
        "All Sections"
    );


    populateSelect(
        "adminLeaderboardSection",
        sections,
        "All Sections"
    );


    populateSelect(
        "adminLeaderboardRoom",
        roomKeys,
        "All My Rooms"
    );


    populateSelect(
        "studentLeaderboardSection",
        sections,
        "All Sections"
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
        students.find(
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

function renderAdminLeaderboard() {
    const list =
        getFilteredLeaderboard("admin");

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
                #${student.rank}
            </td>

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

            <td class="level-cell">
                ${student.progress.level}
            </td>

            <td class="exp-cell">
                ${formatNumber(
                    student.progress.exp
                )}
            </td>

            <td>
                ${student.progress.currentStage}
            </td>

            <td class="correct-cell">
                ${student.statistics.correctAnswers}
            </td>

            <td class="wrong-cell">
                ${student.statistics.wrongAnswers}
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
    const list =
        getFilteredLeaderboard("student");

    const tbody =
        document.getElementById(
            "studentLeaderboardTable"
        );


    tbody.innerHTML = "";


    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
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


        row.innerHTML = `
            <td class="rank-cell">
                #${student.rank}
            </td>

            <td class="nickname-cell">
                ${escapeHTML(
                    student.nickname
                )}
            </td>

            <td>
                ${escapeHTML(
                    student.yearSection
                )}
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
                ${student.progress.currentStage}
            </td>
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

function renderCurrentStudent() {
    if (
        currentRole !== "student" ||
        !currentUser?.uid
    ) {
        return;
    }


    const profile =
        students.find(
            student =>
                student.uid ===
                currentUser.uid
        );


    const learning = currentRoomMembership;
    const student = learning || profile;


    if (!student) {
        document.getElementById("learningRoomKey").textContent =
            currentUser.roomKey || "No room joined";
        document.getElementById("learningRoomStatus").textContent =
            "No Unity progress found";
        return;
    }


    const firstLetter =
        student.nickname
            .charAt(0)
            .toUpperCase();


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
            profile?.nickname || student.nickname;


    document
        .getElementById("studentEmail")
        .textContent =
            currentUser.email || profile?.email || "";


    document
        .getElementById("studentLevel")
        .textContent =
            student.progress.level;


    document
        .getElementById("studentExp")
        .textContent =
            formatNumber(
                student.progress.exp
            );


    document
        .getElementById("studentStage")
        .textContent =
            student.progress.currentStage;


    document
        .getElementById("studentNumber")
        .textContent =
            student.studentNumber || profile?.studentNumber || "-";


    document
        .getElementById("studentSection")
        .textContent =
            student.yearSection || profile?.yearSection || "-";


    document
        .getElementById("learningRoomKey")
        .textContent =
            learning?.roomKey ||
            currentUser.roomKey ||
            "No room joined";


    document
        .getElementById("learningRoomStatus")
        .textContent = learning
            ? (learning.status === "completed"
                ? "Completed"
                : "In progress")
            : "No Unity progress found";


    document
        .getElementById("progressStage")
        .textContent =
            student.progress.currentStage;


    document
        .getElementById("progressLevel")
        .textContent =
            student.statistics.correctAnswers;


    document
        .getElementById("progressExp")
        .textContent =
            student.statistics.wrongAnswers;


    document
        .getElementById(
            "progressCompleted"
        )
        .textContent =
            learning?.monstersDefeated ??
            getStagesCompleted(student);


    document
        .getElementById("quizCorrect")
        .textContent =
            student.statistics.correctAnswers;


    document
        .getElementById("quizWrong")
        .textContent =
            student.statistics.wrongAnswers;


    document
        .getElementById("quizResult")
        .textContent =
            `${calculateAccuracy(student)}%`;


    document
        .getElementById("recordRoomKey")
        .textContent =
            learning?.roomKey ||
            currentUser.roomKey ||
            "-";


    document
        .getElementById("recordTotalQuestions")
        .textContent =
            learning?.totalQuestions ||
            (
                student.statistics.correctAnswers +
                student.statistics.wrongAnswers
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
