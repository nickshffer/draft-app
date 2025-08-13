import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// Replace with your Firebase config from Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyDpcG8E0Adu2qguuNi8_GgCPCsx1qY2tGA",
    authDomain: "draft-app-c824d.firebaseapp.com",
    databaseURL: "https://draft-app-c824d-default-rtdb.firebaseio.com",
    projectId: "draft-app-c824d",
    storageBucket: "draft-app-c824d.firebasestorage.app",
    messagingSenderId: "460887023553",
    appId: "1:460887023553:web:6475bd244fc5f8a928d940"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Realtime Database and get a reference to the service
export const database = getDatabase(app);

export default app;
