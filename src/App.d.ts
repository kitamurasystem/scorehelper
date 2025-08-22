import React from "react";
import type { User } from "firebase/auth";
export declare const ContextUserAccount: React.Context<{
    userAccount: User;
    setUserAccount: React.Dispatch<React.SetStateAction<User>>;
}>;
declare const App: React.FC;
export default App;
