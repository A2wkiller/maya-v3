import {I18nProvider} from "@lingui/react";
import {i18n,bootstrapI18n} from "./src/lib/i18n";
import {createRoot} from "react-dom/client";
import {AskCard} from "./src/components/AskCard";
import "./src/styles.css";
await bootstrapI18n("en");
const response=await fetch("/fixture");const data=await response.json();
createRoot(document.getElementById("root")!).render(<I18nProvider i18n={i18n}><main className="mx-auto max-w-2xl p-6"><h1>Fictional isolated proof</h1><p>No real command execution. Allow stays user-only and is not exercised in this proof.</p><AskCard block={data.card} canAnswer={true} canDismiss={false} onAnswer={async()=>{throw Error("Inert preview")}} onDismiss={async()=>{throw Error("Inert preview")}}/><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}} id="proof-evidence">{JSON.stringify(data.evidence,null,2)}</pre></main></I18nProvider>);
