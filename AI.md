# How I Used AI

This project was built with AI assistance throughout the process. I used AI quite a bit, but not as a one-shot “build this whole app” button. The main idea was to understand the task first, turn it into a clear plan, then implement and review it in smaller pieces.

## 1. Figuring out what to build

I started by discussing the assessment with ChatGPT. Before writing code, I wanted to make sure I understood what the company was actually asking for, which decisions were up to me, and what “production-ready” should reasonably mean for a small take-home task.

I chose **React + TypeScript** for the frontend and a **modern e-ink-inspired design** because the brief gave me those choices. For the backend, the brief specified **NestJS + MongoDB** and left the data-access library open, so Mongoose was a natural option.

A lot of the conversation was about finding the right balance. We discussed session-based authentication versus JWTs, whether Redis would actually add value, duplicate registrations, rate limiting, CSRF, session expiry, idempotency, network failures, and how much testing was worth doing within the time available. I pushed back on suggestions when they felt too complicated for the scope.

My goal wasn't to add every possible feature. It was to identify the things that mattered for a secure, maintainable authentication flow and avoid building infrastructure the task didn't need.

## 2. Turning the discussion into a specification

Once the scope made sense to me, I pulled the requirements and decisions into a detailed document. That became the main build prompt and the starting point for the implementation.

I then used **Spec Kit** to organize the work into a constitution (the project's rules and principles), specifications, an implementation plan, and concrete tasks. The work was split into roughly **nine phases** instead of being handed to the coding agent as one giant request.

That structure was useful because I could review one part of the app at a time and catch problems before they carried over into later phases.

## 3. How I worked through the phases

My loop was pretty consistent:

1. Give the AI agent the next phase and its Spec Kit tasks.
2. Let it implement that part of the project.
3. Read the changed code and compare it with the requirements and decisions we'd made.
4. Fix bugs or ask for targeted changes where something didn't look right.
5. Commit the reviewed changes, then move to the next phase.

I didn't treat generated code as automatically correct. I still had to judge whether the implementation fit the project, especially around authentication, edge cases, and unnecessary complexity.

## 4. Prompts and approaches that helped

Below are examples from my process. The short planning questions are from my ChatGPT discussions; the longer directions are **condensed/paraphrased**, not claimed to be verbatim copies of every prompt I sent to my coding agent.

**Understanding the assessment**

> Review this full-stack assessment. What is actually required, what is optional, and how can I build something secure and polished without overengineering it?

**Challenging the architecture**

> Don't I need to care about auth-related problems like race conditions? What about using Redis? I want it to stay simple but still make a good impression.

**Thinking beyond the happy path**

> What about idempotency and rate limits? What happens when requests overlap, sessions expire, or the network fails during signin or logout?

**Making vague requirements testable**

> Define the session lifecycle, CSRF policy, password-validation rules, and failure behavior as concrete decisions with acceptance criteria—not just names of libraries or security practices.

**Building the implementation brief (condensed)**

> Build a small React/TypeScript and NestJS/MongoDB authentication app. Follow the agreed design and security decisions, keep the architecture simple, and cover signup, signin, a protected welcome page, and logout. Make the e-ink UI responsive and accessible. Include focused tests, setup instructions, and an honest AI.md.

**Phase-by-phase implementation (prompt pattern, not a verbatim quote)**

> Implement the next phase from the Spec Kit task list. Follow the existing conventions and the project constitution. Keep changes scoped to this phase, verify what you can, and report any tradeoffs, errors, or tasks that remain incomplete.

The most useful prompts weren't necessarily the longest ones. Asking AI to **challenge a decision**, explain a tradeoff, or define an observable behavior usually helped more than just asking it to generate another feature.

## 5. What AI helped with vs. what I owned

AI helped me explore architectural options, refine the requirements, structure the Spec Kit documents, implement individual phases, and spot cases worth reviewing.

I was responsible for choosing the scope, deciding which suggestions to keep or reject, reviewing the generated changes, fixing problems, and committing each phase. In particular, I wanted to avoid adding things such as Redis or a generic idempotency framework just because they sound “production-grade.” A simpler solution was better when it met the actual requirements.

## 6. Things I had to rethink or correct

Some of the most valuable corrections happened **before implementation**:

- We initially spent time on a Sequelize-versus-MongoDB conflict from a modified version of the task. Checking the original brief made it clear that the ORM/ODM choice was open, so there was no Sequelize requirement to solve.
- Early authentication suggestions listed security features without fully defining their behavior. I pushed for clearer decisions around session lifetime, CSRF, concurrent requests, password rules, and uncertain network outcomes.
- We considered Redis, more elaborate idempotency handling, and cross-tab coordination. I preferred keeping those out of the core scope unless there was a demonstrated need.

I also reviewed and corrected code as I went through the implementation phases. Before submitting, I should add a couple of **specific code-level examples** here rather than make up details:

- **[Actual issue #1]** What the generated code did, why I changed it, and how I checked the fix. **[File/commit]**
- **[Actual issue #2]** What the generated code did, why I changed it, and how I checked the fix. **[File/commit]**

## 7. Verification and final ownership

My approach was to review each phase before committing it, rather than waiting until the very end to look at everything at once.

**Final checks (fill in with actual results before submitting):**

- Type checking: **[command + result]**
- Lint/build: **[command + result]**
- Authentication and security tests: **[command + result]**
- Manual browser checks: **[what was checked]**
- Any remaining limitations: **[what is still not covered]**

AI sped up the implementation, but I don't see that as removing my responsibility for the code. The important part was being able to understand, question, review, and own what ended up in the repository.
