import type { Metadata } from "next";
import DocumentsApp from "@/components/documents/DocumentsApp";

export const metadata: Metadata = {
  title: "Vesyn — RAG Engine",
  description: "Ask the lab's own documents. Every answer quotes the passage it came from, or says it is not established.",
};

// The lab's own documents, searched and reviewed by the evidence service (MongoDB Atlas).
export default function Page() {
  return <DocumentsApp />;
}
