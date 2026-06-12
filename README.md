# 🤖 Oracle — Production-Grade AI RAG Assistant

<div align="center">

### Ask grounded questions over your documents and GitHub repositories with intelligent retrieval.

**Full-stack Retrieval-Augmented Generation (RAG) platform with hybrid search, reranking, OCR ingestion, repository indexing, speech transcription, and evaluation pipelines.**

[🚀 Live Demo](https://oracle-lyart-six.vercel.app/) • [💻 Repository](https://github.com/tush-dev/Oracle)

</div>

---

## ✨ Overview

Oracle is a production-focused **AI knowledge assistant** designed to provide accurate, grounded answers from uploaded documents and GitHub repositories.

Instead of relying on generic LLM responses, Oracle retrieves relevant context from your actual data using a sophisticated retrieval pipeline before generating answers.

It combines:

- 📄 Document ingestion
- 🐙 GitHub repository indexing
- 🔍 Hybrid semantic + keyword retrieval
- 🧠 Context reranking
- 🎤 Speech transcription
- 📊 RAG evaluation metrics
- ⚡ Real-time chat interface

This makes Oracle ideal for:

- Developer documentation assistants
- Repository Q&A systems
- Internal enterprise knowledge assistants
- Research document querying
- Technical codebase exploration

---

# 🚀 Key Features

## 📂 Multi-Source Knowledge Ingestion

Oracle can ingest and understand content from multiple sources:

✅ PDF documents  
✅ GitHub repositories  
✅ OCR-extracted scanned content  
✅ Audio transcription workflows  

---

## 🧠 Advanced RAG Pipeline

Unlike basic chatbot wrappers, Oracle uses a robust retrieval architecture:

- Structure-aware chunking
- Semantic vector retrieval
- BM25 keyword retrieval
- Reciprocal Rank Fusion (RRF)
- Cohere reranking
- Grounded answer generation
- Automated RAG evaluation

This improves factual accuracy and reduces hallucinations.

---

## 🐙 GitHub Repository Intelligence

Index entire repositories and ask questions like:

> “How does authentication work?”  
> “Where is the API routing implemented?”  
> “Which file handles embeddings?”  
> “Explain the database architecture.”

Oracle parses repository trees, extracts meaningful code context, and enables intelligent codebase querying.

---

## 🎤 Speech + OCR Support

Supports richer input workflows:

- Audio transcription using AssemblyAI
- OCR extraction from scanned PDFs
- Voice-driven knowledge querying

---

## 📊 RAG Evaluation Layer

Oracle includes evaluation pipelines to assess response quality using:

- Faithfulness
- Answer relevance
- Context precision

This makes the system engineering-focused—not just UI-focused.

---

# 🏗 Architecture

## System Flow

```text
User Query
   ↓
Frontend Chat UI
   ↓
Backend API Layer
   ↓
Document / GitHub Ingestion
   ↓
Text Parsing + Structure-Aware Chunking
   ↓
Embedding Generation (Voyage AI)
   ↓
Pinecone Vector Storage
   ↓
Hybrid Retrieval (Vector + BM25)
   ↓
Reciprocal Rank Fusion
   ↓
Cohere Reranking
   ↓
Groq Answer Generation
   ↓
RAG Evaluation
   ↓
Grounded Response to User
```

---

# 🔬 RAG Pipeline Deep Dive

## 1. Content Ingestion

Documents and repositories are parsed into clean structured text.

Supported ingestion:

- PDFs
- GitHub repositories
- OCR-extracted content
- speech transcripts

---

## 2. Intelligent Chunking

Instead of naive fixed-size chunking, Oracle uses structure-aware segmentation:

- heading boundaries
- function blocks
- class boundaries
- file segmentation
- table-aware chunking

This preserves semantic meaning during retrieval.

---

## 3. Embedding Generation

Chunks are converted into dense semantic vectors using:

**Voyage AI embeddings**

Each chunk is enriched with source metadata for grounded retrieval.

---

## 4. Hybrid Retrieval

Oracle combines:

### Semantic Search
Dense vector similarity from Pinecone.

### Keyword Search
BM25 lexical retrieval.

Then merges both via:

**Reciprocal Rank Fusion (RRF)**

This significantly improves recall.

---

## 5. Reranking

Retrieved candidates are reranked using:

**Cohere Rerank API**

This ensures only the most relevant context reaches the LLM.

---

## 6. Grounded Generation

Final context is passed to:

**Groq LLM inference**

with strict grounding instructions to reduce hallucination.

---

## 7. Evaluation..

Generated responses are scored on:

- faithfulness
- relevance
- precision

to monitor answer quality.

---

# 🛠 Tech Stack

## Frontend

- React
- Vite
- TypeScript

## Backend

- Node.js
- Express
- TypeScript

## AI / Retrieval

- Pinecone
- Voyage AI
- Cohere
- Groq
- BM25
- Reciprocal Rank Fusion

## Integrations

- GitHub API
- Clerk
- Supabase
- OCR services
- AssemblyAI

## Deployment

- Vercel

---

# 📁 Project Structure

```text
backend/
 ┣ src/
 ┃ ┣ rag/          → ingestion, chunking, retrieval, reranking, evaluation
 ┃ ┣ routes/       → REST API endpoints
 ┃ ┣ services/     → GitHub, OCR, auth, storage integrations
 ┃ ┗ lib/          → provider wrappers and shared utilities

frontend/
 ┣ src/
 ┃ ┣ pages/        → main application screens
 ┃ ┣ components/   → reusable UI components
 ┃ ┣ hooks/        → frontend custom hooks
 ┃ ┗ lib/          → API utilities
```

---

# ⚙️ Local Setup

## Backend

```bash
cd backend
cp .env.example .env
npm install
npm run build
npm run dev
```

---

## Frontend

```bash
cd frontend
npm install
npm run dev
```

---

# 🌍 Deployment

Oracle supports deployment across modern platforms.

See:

- Vercel
- Render
- Railway

Detailed deployment instructions:

```bash
DEPLOYMENT.md
```

---

# 🎯 Why This Project Matters

Oracle demonstrates practical software engineering + applied AI concepts:

✅ Production-grade RAG architecture  
✅ Retrieval engineering  
✅ Hybrid search systems  
✅ LLM grounding strategies  
✅ AI evaluation pipelines  
✅ GitHub repository intelligence  
✅ Full-stack TypeScript architecture  
✅ Real-world deployment workflows  

---

# 👨‍💻 Author

**Tushar Panwar**

B.Tech @ NIT Jalandhar  
Full-Stack Developer | AI Engineering Enthusiast

---

<div align="center">

### ⭐ If you found this interesting, consider starring the repo.

</div>
