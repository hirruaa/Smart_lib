# Smart Lib Capstone Draft: Chapters 1 and 3

> **Draft for adviser and school review.** This document is based on the project context and objectives supplied by the researchers and on the current repository documentation and source. Replace every bracketed item with verified study information. Do not submit the editorial notes or claim that a planned test, deployment, interview, approval, or evaluation has occurred unless there is evidence. Confirm the school's required chapter format, research design, citations, ethics process, and terminology with the adviser.
>
> **Important scope correction requiring adviser approval:** The current application uses browser-side OCR to suggest a reference number from a GCash receipt image; it does not use Gemini to extract that reference. Gemini is used for advisory screening of contributed PDF materials and for the configured library assistant. The receipt objective and scope below use wording that matches the application. Obtain approval for this revision before treating it as the approved study text.

---

# CHAPTER 1

## INTRODUCTION

### 1.1 Background of the Study

Academic libraries support teaching, learning, research, and independent study by organizing resources and helping members discover materials relevant to their academic work. As library services adopt web-based tools, institutions can make collection information easier to search and can provide selected digital services alongside the management of physical materials. These tools do not remove the need for sound library procedures; rather, they can help organize information, document transactions, and make authorized resources easier to locate. **[Add verified, current scholarly or institutional sources for claims about academic libraries, digital library services, and technology adoption. Confirm that each source supports the sentence where it is cited.]**

At Mary the Queen College, the library serves students and faculty members who need academic references for coursework, instruction, and research. The existing workflow described for this project includes locating printed books in the library and recording physical borrowing transactions in paper-based logbooks. Under this workflow, users may need to visit the library to determine whether a particular printed title is available, while library personnel maintain and consult circulation records. These arrangements can make it difficult to search holdings remotely and retrieve transaction information efficiently. The researchers should support these descriptions with their documented observations, interviews, or other approved process-analysis evidence; they should not be presented as measured findings unless such evidence has been collected.

This study proposes Smart Lib, a role-based web application intended to support the college's library operations and provide selected digital study services. The system brings together an online public access catalog (OPAC), physical-book and copy records, QR-code-based physical resource lookup, staff-confirmed circulation, and controlled access to selected digital materials. Eligible free or points-based digital access is designed to be granted automatically when the applicable rules are satisfied. Physical checkout remains a staff-controlled process, since an online request does not itself represent a handover of a physical item.

For authorized digital resources, Smart Lib provides an embedded PDF reading environment with personal study features such as reading progress, notes, highlights, bookmarks, and drawings, subject to the capabilities enabled in the deployed reader. Access controls are intended to restrict retrieval of protected files to users authorized by the system. These controls cannot reliably prevent an authorized reader from taking a screenshot, recording the screen, or photographing the display. Accordingly, PDF protections are described as access control and download deterrence, not as screenshot prevention.

The application also supports member-submitted academic materials. An AI-assisted screening function can provide a preliminary summary and relevance, usefulness, or concern signals to administrators. Those signals are advisory: authorized personnel retain responsibility for deciding whether a contribution is accepted, and any points recognition is tied to the applicable human decision and recorded policy. The library assistant is intended to respond to supported categories of catalog, policy, or account questions using information available to the signed-in user; it is not intended to replace library personnel or operate as an unrestricted source of institutional facts.

For supported physical-library payment workflows, the current receipt-reference feature uses browser-side optical character recognition (OCR) to suggest a transaction reference from a user-selected image. The suggestion may contain errors and does not verify settlement or establish that payment was made. The receipt image is not sent to Gemini for reference extraction in the current implementation. Staff must verify payment through the applicable process before taking any payment-dependent action. The school should review and approve the corresponding thesis wording and privacy disclosure.

Smart Lib is intended to support students, faculty members, library personnel, and system administrators through a common application. The study will examine whether the developed system meets its documented functional requirements and how it performs under defined functional, performance, usability, and selected software-quality evaluations. The study's conclusions will be limited to the tests, participants, environment, and evidence actually obtained.

### 1.2 Project Context

The project is situated in the library operations of Mary the Queen College. The physical collection requires processes for cataloging items, identifying their availability and location, recording borrowing and return transactions, and monitoring items that are due or overdue. The workflow baseline supplied for this study describes physical shelf searches and paper-based circulation records. **[Identify the dates, methods, and records used to confirm this baseline, or revise the statement to reflect the actual process-analysis evidence.]**

The principal stakeholder groups are:

- **Students**, who need to discover library holdings, access eligible digital resources, borrow physical books through the established staff process, and organize personal study activity.
- **Faculty members**, who need to locate relevant materials and use library services; their profiles may include an academic rank and assigned courses.
- **Library personnel**, who need to maintain catalog and circulation information, handle physical transactions, review payment evidence, and assess contributed materials.
- **System administrators**, who need to manage accounts, system configuration, academic lists, and permitted operational records.

Smart Lib supports these activities through a searchable catalog, physical inventory and circulation records, time-limited digital access, a protected reader, contribution review, member points and notifications, an intent-based assistant, and administrative interfaces. The source baseline has three application roles—student, faculty, and admin. Library personnel use the admin role; the application does not currently demonstrate a separate least-privilege librarian role. This distinction should be made clear in requirements, access testing, and any claim about staff permissions.

Student profile information can include school, department, course or program, and year level. Faculty profile information can include school, department, academic rank, and multiple assigned courses. Faculty rank and course lists have administrator-managed catalogs, while school and department profile fields are currently free-text fields. A member must not be able to change protected role assignments or grant themselves administrative permissions.

The system distinguishes two different services. A digital access grant authorizes an eligible member to view a protected file for the configured period; it is not dependent on a physical copy being available. Physical-book checkout requires staff confirmation at handover and must associate a physical copy with the transaction. Payment evidence and OCR output remain pending until verified by authorized personnel. This separation is important to prevent digital entitlement rules from being confused with physical circulation decisions.

### 1.3 Statement of the Problem

#### General Problem

How can a web-based library management and study workspace system support resource discovery, physical circulation tracking, controlled digital access, transaction documentation, academic resource sharing, and self-service library assistance at Mary the Queen College?

#### Specific Problems

This study seeks to address the following questions:

1. How can a web-based system support the recording and monitoring of physical book circulation, time-limited digital access grants, and applicable overdue records?
2. How can students and faculty search physical and digital library resources and determine the availability and location of cataloged materials through an online catalog?
3. How can authorized users access protected digital resources and manage personal study information—including notes, highlights, bookmarks, and reading progress—within a PDF study workspace?
4. How can a structured library assistant respond to supported catalog, library-policy, and member-account inquiries using information that the current user is authorized to access?
5. How can the system assist staff by suggesting transaction reference text from payment receipt images, and support preliminary AI screening and administrative review of peer-contributed academic resources?
6. How can administrative interfaces and audit records support authorized management of users, resources, contributions, circulation, and other operational information?
7. To what extent does the developed system satisfy its functional requirements, performance measures, usability criteria, and selected software-quality characteristics under the evaluation conditions defined for the study?

### 1.4 Objectives of the Study

#### 1.4.1 General Objective

To design, develop, and evaluate Smart Lib, a role-based web application intended to support Mary the Queen College library operations through integrated resource discovery, physical circulation tracking, controlled digital access, interactive study tools, receipt-reference assistance, peer-contributed academic resource review, and structured library assistance.

#### 1.4.2 Specific Objectives

The study aims to:

1. **Analyze existing processes** for physical borrowing, inventory management, circulation tracking, and resource discovery at the Mary the Queen College Library to identify operational requirements and possible areas for improvement.
2. **Specify system requirements**, including user roles, workflows, data-protection requirements, and access-control policies.
3. **Design the system** architecture, relational data structure, authorization mechanisms, and responsive user interfaces for students, faculty members, library personnel, and system administrators.
4. **Develop core library modules** for catalog discovery, QR-code-based physical lookup, physical circulation, eligible free and points-based time-limited digital access, and PDF study tools.
5. **Develop self-service and administrative functions**, including an intent-based assistant for supported inquiries and interfaces for managing users, resources, circulation, contributions, and relevant operational records.
6. **Support receipt-reference entry and resource contributions** through browser-side OCR that suggests a reference from a receipt image for staff review, and AI-assisted preliminary screening of contributed materials while retaining human administrative approval. **[This is a proposed wording correction and requires adviser approval because the earlier objective specified Gemini for receipt extraction.]**
7. **Implement security controls**, including role-based access control, server-side authorization, database Row-Level Security (RLS), and authorization checks for protected digital resources.
8. **Evaluate the system** for functional correctness, defined performance measures, usability, and selected software-quality characteristics using documented test cases and, if approved, the applicable edition of ISO/IEC 25010 and the System Usability Scale (SUS).
9. **Deploy and evaluate the application** in the approved hosting and database environment, subject to successful release preparation, institutional authorization, and documented verification.

### 1.5 Scope and Limitations

#### 1.5.1 Scope

The study covers the design, development, and evaluation of Smart Lib as a web-based library management and study workspace for Mary the Queen College. The intended users are students, faculty members, library personnel, and system administrators. The system's functions depend on assigned roles and permissions.

The study includes the following:

1. **Online catalog and physical resource lookup.** Users can search catalog information for physical and digital resources. Physical lookup may use QR codes associated with cataloged holdings or copies. Public views should expose only approved catalog information and aggregate availability, not borrower identities or private transaction details.
2. **Physical circulation management.** Authorized staff can manage copies and record physical borrowing, checkout, return, and applicable overdue or fine information. An online request or submitted receipt image does not complete a physical checkout; staff confirmation remains necessary.
3. **Controlled digital access.** Selected digital resources can be made available through the access rules configured for the system. Eligible free and points-based access is intended to be granted after server/database validation, with points debited according to the selected duration where applicable. Paid digital transactions are not enabled in the current workflow.
4. **PDF study workspace.** An authorized user can read protected PDF material and use the personal study functions implemented for notes, highlights, bookmarks, drawings, or reading progress. Authorization may restrict file retrieval, but cannot guarantee prevention of screenshots, recording, photography, or other capture by an authorized reader.
5. **Receipt-reference assistance.** For supported physical-library transactions, the browser-side OCR function suggests a numeric reference from the selected receipt image. Staff remain responsible for confirming payment. OCR is not fraud detection, payment authentication, or settlement verification.
6. **Peer contribution and review.** Authenticated members may submit eligible academic resources. AI-assisted screening provides preliminary information to human reviewers; designated personnel make the final administrative decision and points award according to the recorded policy.
7. **Intent-based library assistance.** The assistant handles implemented categories such as catalog, policy, and member-account inquiries. Its responses depend on supported intents and authorized data sources.
8. **Administrative management.** Authorized administrators manage member accounts, academic rank and course lists, catalog entries, contributions, circulation information, and permitted operational records. The current role model represents library staff under the `admin` role rather than a separate librarian role.
9. **System evaluation.** The system will be evaluated only on the requirements, measures, participants, environment, and test cases documented in Chapter 3. Implementation presence alone will not be treated as proof of correctness, security, usability, or operational effectiveness.

The current implementation is based on a Next.js web application, Supabase services for authentication, relational data, storage, and access policies, and optional integrations that include Google Gemini and Google Drive. Vercel is the intended hosting environment in the approved project objectives. Actual deployment, production configuration, and live integration status must be verified before they are reported as completed.

#### 1.5.2 Limitations

1. **Payment-provider integration.** Paid digital-resource checkout is outside the current enabled workflow. Neither uploaded evidence nor OCR output grants paid access. Any future paid workflow requires an approved provider and trusted payment confirmation.
2. **Receipt interpretation.** OCR may misread a reference or fail to extract it. It only proposes text for staff review and does not verify payment settlement or the authenticity of a receipt.
3. **AI screening.** AI-generated contribution screening is preliminary decision support. It does not establish academic accuracy, originality, copyright status, or suitability conclusively. Human review remains necessary.
4. **AI assistant.** The assistant is limited to supported intents and the information available to its implementation. It may not answer every question and must not be treated as an authoritative institutional policy source unless its answers are verified.
5. **Digital resource protection.** Access checks can restrict unauthorized retrieval, and browser-level deterrents may discourage some copying. No browser-based control can reliably stop a user who is authorized to view a page from capturing its displayed content.
6. **External publisher systems.** Smart Lib does not synchronize directly with commercial e-book publishers or their proprietary platforms. Digital-resource availability depends on materials and permissions managed by the institution.
7. **Scanning hardware.** The project does not include dedicated barcode or RFID hardware. QR lookup depends on supported camera and browser capabilities of the user's device.
8. **Evaluation generalizability.** Findings will be limited to the participants, tasks, test data, devices, environment, and time period actually used. They should not be generalized beyond those conditions without additional evidence.
9. **Operational readiness.** The application depends on external hosting, database, storage, and optional service configuration. A successful build does not by itself establish production deployment, availability, backup recovery, or security compliance.

### 1.6 Significance of the Project

Smart Lib may benefit the following stakeholders, subject to the results of the study and the institution's operational approval:

- **Mary the Queen College.** The project may provide a centralized way to present information about physical holdings and selected digital library services, and may support the college's exploration of technology-assisted library operations.
- **Library personnel.** Catalog, circulation, contribution-review, and administrative functions may help organize records and provide clearer visibility into operational transactions. Receipt OCR may reduce manual transcription in some cases, but payment verification remains a staff responsibility.
- **Students.** The catalog may help students discover resources and check information before visiting the library. Eligible digital resources and personal PDF study tools may support reading and independent study.
- **Faculty members.** The system may help faculty discover course-relevant resources and support organized review of academic materials contributed to the library.
- **System administrators.** Administrative tools and selected audit information may support account and system management within the permissions assigned to administrators.
- **Future researchers.** The project may provide a reference for further work on hybrid physical/digital library workflows, protected digital access, study workspaces, and AI-assisted administrative processes. Future researchers can build on the documented evaluation and limitations.

These benefits are intended outcomes, not established results. The study's evaluation should determine whether and to what extent they are achieved.

### 1.7 Definition of Terms

- **Access grant** — A system record authorizing a member to retrieve a digital resource under the applicable access rules and, where relevant, for a defined period.
- **Artificial intelligence (AI)-assisted screening** — Automated analysis that provides preliminary information to a human reviewer; it does not make the final contribution decision.
- **Browser-side optical character recognition (OCR)** — Recognition of text in an image within the user's browser. In this project it suggests a transaction reference and does not verify payment.
- **Contribution** — An academic resource submitted by an authenticated member for screening and administrative review.
- **Digital resource** — An electronic library material managed by the system and made available under its configured authorization rules.
- **Physical circulation** — The staff-controlled process of recording the borrowing, checkout, return, or other disposition of an individual physical library copy.
- **Online public access catalog (OPAC)** — A searchable catalog interface through which users can discover approved information about library resources.
- **Role-based access control (RBAC)** — A method of assigning permissions according to a user's trusted system role.
- **Row-Level Security (RLS)** — Database policies that restrict which rows a database user or application session may read or modify.
- **System Usability Scale (SUS)** — A standardized questionnaire used to obtain a participant-reported measure of perceived usability. Its administration and scoring must follow the approved instrument and study protocol.
- **Time-limited digital access** — Authorization to access a digital resource for the period set by the system's applicable rules.
- **QR-code lookup** — Use of a quick response code to identify an associated catalog item or physical copy; scanning does not itself authorize checkout.

---

# CHAPTER 3

## METHODOLOGY

> **Complete before submission:** Replace bracketed placeholders with the approved research design, school-specific respondent information, actual dates and counts, selected evaluation measures, and ethics/consent details. Do not report planned work in past tense as though it has already been completed. The methodology below is a proposed structure for an applied system-development and evaluation study; confirm it against the college's required format and adviser-approved protocol.

### 3.1 Research and Development Design

The study will use an applied system-development approach to design, implement, and evaluate Smart Lib in response to identified library-workflow needs at Mary the Queen College. System development will proceed through documented stages: (1) process and requirements analysis, (2) system and data design, (3) implementation, (4) verification and revision, and (5) user-oriented evaluation. **[Name the development model required or approved by the adviser—for example, iterative development—and explain why it fits the project. Do not claim a model was followed unless project records support that claim.]**

The development activity will be accompanied by descriptive evaluation. Functional test cases will determine whether selected requirements produce the expected outcomes. Defined performance measures will describe observed response or completion times under specified conditions. Participants will complete approved tasks and provide usability feedback; if approved, the SUS questionnaire will be administered using its standard wording and scoring procedure. Selected software-quality characteristics will be assessed through an explicit rubric, test evidence, or both. The study will not treat the presence of a feature in source code as evidence that the feature has passed evaluation.

The evaluation is not a controlled experiment unless the approved protocol explicitly defines comparison groups, interventions, and statistical analysis. It will not claim that Smart Lib caused improvements in grades, learning outcomes, or institutional efficiency unless those outcomes are measured using an approved comparative design.

### 3.2 Locale and Study Setting

The study will be conducted at Mary the Queen College, specifically in **[identify the campus, department, library, or other approved setting]**. The system evaluation will use **[identify the approved test environment, such as a local isolated test environment or a school-approved staging deployment]** and **[identify the devices, browsers, and network conditions included in testing]**.

The software's intended hosting environment is Vercel, with Supabase services for database, authentication, and storage. These are technical design facts from the project documentation; the researchers must state whether the evaluated version was locally hosted, staged, or actually deployed. If a deployed instance is used, record its release/version, test dates, and relevant environment configuration without disclosing secrets or personal data.

### 3.3 Respondents and Sampling

The intended respondent groups are students, faculty members, and library personnel who are expected to use or oversee Smart Lib. System administrators may also participate if they are included in the approved evaluation protocol.

The target population will consist of **[define the eligible population by role and institution/department]**. The population size is **[N = insert verified count and source/date]**. The study will include **[n = insert approved or achieved respondent count]** participants selected using **[insert adviser-approved sampling method and justification]**. If participants are grouped by role, report the count for each group: students **[n]**, faculty **[n]**, library personnel **[n]**, and administrators **[n]**.

Eligibility criteria will be **[insert approved inclusion criteria, such as role, age/consent eligibility, and relevant experience]**. Exclusion criteria will be **[insert criteria, if any]**. Recruitment will follow **[describe approved recruitment method and responsible person]**. Participation will be voluntary and will not affect a participant's grades, employment, access to library resources, or relationship with the institution.

**No respondent number or sampling method has been supplied for this draft.** Do not use total enumeration, a convenience sample, a formula-derived sample size, or a role distribution unless it is approved and supported by actual population and recruitment records.

### 3.4 System Development and Design

Smart Lib is designed as a role-based web application with a browser-facing interface, application-server routes, a relational database and storage services, and optional external services. The database is authoritative for user roles, resource access, point transactions, and physical circulation state; client-side interface state alone must not authorize those actions.

The system design includes the following principal modules:

1. **Account and profile management:** authentication and role-aware experiences for students, faculty, and administrators. Student profiles may include school, department, course/program, and year level. Faculty profiles may include academic rank and multiple assigned courses. The current implementation represents library personnel through the admin role.
2. **Catalog and physical inventory:** searchable resource records, individual physical-copy information, availability, location, and QR lookup.
3. **Physical circulation:** requests, staff-confirmed checkout, due-date and return records, and applicable overdue/fine information. Where payment evidence is required, staff make the final verification.
4. **Digital access and reader:** eligible free or points-based access grants, protected PDF retrieval, and personal study records. Paid e-book checkout is outside the enabled workflow.
5. **Contributions and recognition:** private member submissions, preliminary AI screening, human administrative decisions, feedback, and policy-governed points outcomes.
6. **Study workspace:** member-specific notes, highlights, bookmarks, drawings, and reading progress where supported by the deployed version.
7. **Library assistant:** predefined/implemented inquiry categories with responses grounded in supported catalog, policy, and authorized member data.
8. **Administrative and audit functions:** permitted management of members, academic catalogs, resources, circulation, contributions, and operational records.
9. **Receipt-reference assistance:** browser-side OCR suggests text from a selected image for staff review. It does not confirm payment or grant access.

**[Insert an adviser-approved system architecture diagram, database/entity-relationship diagram, and any required use-case or data-flow diagrams. Ensure diagrams describe the evaluated release, not an aspirational future design.]**

### 3.5 Instruments and Materials

The study will use the instruments approved for each evaluation activity:

| Instrument | Purpose | Required study record |
|---|---|---|
| Process-analysis guide | Document current resource discovery, physical circulation, and record-management practices | Approved questions/checklist, dates, participants or source records, and summarized evidence |
| Requirements traceability matrix | Link each approved requirement to implementation and verification evidence | Requirement ID, test case or evidence, result, defect/reference |
| Functional test-case set | Verify expected behavior and authorization boundaries for selected workflows | Preconditions, role/test data, steps, expected result, actual result, pass/fail, evidence |
| Performance test protocol and measurement tool | Measure defined user-facing operations under repeatable conditions | Device/browser, network, sample size/repetitions, start/end definitions, raw timings |
| Task observation and completion form | Record task success, errors, assistance, and completion time | Task definition, participant code, observation rules, outcome |
| System Usability Scale questionnaire (if approved) | Measure perceived usability using the standard 10-item instrument | Approved language/version, completed anonymous forms, scoring sheet |
| ISO/IEC 25010 evaluation rubric (if approved) | Assess selected software-quality characteristics using defined indicators | Confirmed standard edition, selected characteristics, indicators, evidence, ratings |

Use only questionnaires and translated versions authorized for the study. **[Identify any translation, pilot test, expert review, reliability procedure, and approval required by the institution.]** Preserve raw, de-identified records according to the approved retention plan.

### 3.6 Development and Evaluation Procedure

The following sequence is proposed. Report dates, participants, and completed activities only after they have occurred.

#### Phase 1: Process and requirements analysis

The researchers will document the existing library processes relevant to resource discovery, physical circulation, inventory, and transaction records through **[approved observation/interview/document-review method]**. Findings will be separated from assumptions and translated into functional and non-functional requirements. Requirements that affect student privacy, staff authority, payment verification, or digital-file access will be reviewed with **[authorized school/library representatives]**.

#### Phase 2: System and data design

The researchers will prepare system architecture, user-flow, data-model, role/permission, and interface designs. Student, faculty, library-personnel, and administrator workflows will be documented. The design will distinguish physical-copy circulation from digital access grants and identify which operations require staff confirmation. The school will review the design for policy fit and data handling before the evaluation release is prepared.

#### Phase 3: Implementation

The application will implement the approved requirements using the project technology stack. Authentication, server-side authorization, database policies, private file access, and transaction integrity will be treated as security boundaries. Optional AI features will be isolated from authoritative decisions: Gemini screening results will not approve contributions, and OCR output will not verify payment. Failed external-service operations must be presented as failures and must not grant access or alter payment state.

#### Phase 4: Verification and revision

Researchers will execute the functional and security test cases using isolated test accounts and test data. Tests will cover expected success paths and negative cases, such as unauthorized access, insufficient points, expired digital access, unavailable physical copies, invalid payment evidence, and AI-service failure. Defects will be recorded, corrected where in scope, and retested. Database and storage tests must use an isolated environment, never production data or credentials.

#### Phase 5: Participant evaluation

After required institutional and ethics approvals, recruited participants will receive study information and provide the approved consent. Participants will be assigned representative tasks relevant to their role, such as finding a resource, checking physical availability, opening an authorized digital resource, using a study feature, or completing an administrator workflow where applicable. Researchers will record task outcomes and observations using participant codes. Participants will complete the approved usability instrument and/or feedback form. The procedure will avoid using real payment details or unnecessary sensitive personal data.

#### Phase 6: Deployment and operational verification

If deployment is within the approved study and is completed, the researchers will record the deployed release identifier, hosting/database environment, deployment date, and verification checks. They will test the canonical application URL, authentication, core role-specific workflows, protected-file behavior, and applicable monitoring/backup arrangements. If the application is not deployed or the deployment cannot be verified, the study will state that limitation and will not report deployment as completed.

### 3.7 Functional and Security Testing

Functional testing will use requirement-linked test cases. Each test will define its preconditions, actor role, test data, steps, expected result, actual result, and outcome. Test accounts and records will be synthetic or institution-approved and isolated from production data.

At minimum, the test plan should include:

- Registration/sign-in, role routing, and denial of privileged operations to unauthorized roles.
- Student and faculty profile access, permitted edits, and protection of role or privileged academic assignments.
- Catalog search, filters, public physical availability, and QR lookup without exposing borrower identity or private transaction information.
- Physical request, staff-confirmed checkout, one-copy/one-active-loan integrity, return, and any approved waitlist behavior.
- Free and points-based digital access, including exact duration/point rules, insufficient balance, repeated requests, expiration, and protected-file denial after access ends.
- Reader study-data ownership for notes, highlights, bookmarks, drawings, or progress included in the evaluated version.
- Contribution upload validation, AI-screening success/failure, human decision, feedback, and points awarded only under the approved policy.
- Receipt OCR suggestion, manual correction, and confirmation that OCR alone does not verify payment or grant a paid entitlement.
- Assistant responses for supported inquiry categories and access boundaries for member-specific information.
- Administrative permissions, relevant audit events, understandable errors, and failure states.

For each test case, report `Pass` only when the expected outcome is observed and recorded. The functional completion rate may be calculated as:

**Functional test pass rate (%) = (number of passed executed test cases / number of executed test cases) × 100.**

Report excluded, blocked, and not-run test cases separately; do not omit them from the account of results.

### 3.8 Performance Evaluation

Performance evaluation will measure only explicitly selected operations under repeatable conditions. Candidate operations include loading the catalog, completing a catalog search, opening a resource detail page, and retrieving an authorized PDF. The researchers will define **[the selected operations, timing start/end points, target response times, test dataset size, number of repetitions, concurrency level if applicable, and measurement tool]** before testing.

Record browser/device, network conditions, test environment, dataset size, cache conditions, and test date. For each operation, report the number of trials and an appropriate summary such as median and 95th percentile when the sample size and measurement method support it. Separate client rendering, server response, and external provider latency when the instrumentation permits. AI-provider latency and failures should be reported separately from core catalog performance.

Performance thresholds in the project requirements are targets, not results. Use them only if the adviser approves them as study criteria and the measurement environment is documented. Do not state that the system meets a threshold without recorded measurements.

### 3.9 Usability and Software-Quality Evaluation

#### 3.9.1 Usability

Participants will perform role-appropriate tasks using the approved test version. Researchers will record task completion, errors, requests for assistance, and completion time according to a consistent observation protocol. Participants may then complete the approved usability questionnaire and provide comments on clarity, navigation, accessibility, and perceived usefulness.

If the System Usability Scale is approved, administer the complete standard 10-item questionnaire without changing its wording or response scale unless an approved translation or adaptation is used. For each respondent, score odd-numbered items as the response minus 1 and even-numbered items as 5 minus the response; add the adjusted values and multiply the sum by 2.5 to obtain a score from 0 to 100. Report the number of valid responses and descriptive statistics such as mean, standard deviation, and range. A SUS score is not a percentage and should not be interpreted as one. Any qualitative labels or comparative benchmarks must be supported by an identified source and explained.

#### 3.9.2 Selected software-quality characteristics

The researchers will evaluate **[list the characteristics and sub-characteristics selected with the adviser]** using indicators appropriate to Smart Lib and the available evidence. Possible areas include functional suitability, performance efficiency, usability, reliability, security, compatibility, and maintainability. Confirm the edition of ISO/IEC 25010 required by the institution, cite it accurately, and use the corresponding terminology.

The evaluation will identify the evidence used for each characteristic—for example, requirement-linked functional tests, access-control tests, measured task timings, participant usability responses, or documented code/build checks. Source presence alone is insufficient evidence of a quality rating. The study will report untested characteristics as not evaluated rather than implying conformity to the full standard or certification.

### 3.10 Data Analysis

Quantitative results will be summarized using descriptive statistics appropriate to each measure. The functional test pass rate will be calculated using the formula in Section 3.7. Performance times will be summarized as defined in Section 3.8. SUS scores, if collected, will be summarized using the scoring procedure in Section 3.9.1. Task completion and error counts will be reported by task and, where the sample supports it, by participant role.

Open-ended responses and observation notes will be organized using **[identify the approved qualitative analysis method]**. The researchers will describe the coding or categorization procedure and use de-identified quotations only when permitted by the consent and ethics protocol. Do not infer population-wide views from a small or non-random sample.

Any statistical tests beyond descriptive summaries—including comparisons by role or before/after measures—must be selected in advance with the adviser, supported by the study design and sample, and reported with the relevant assumptions and limitations. No inferential result should be invented to fill a template.

### 3.11 Ethical, Privacy, and Security Considerations

The study will obtain **[identify required school, department, research ethics, or data-protection approval]** before recruiting participants or collecting identifiable information. Participants will receive a clear explanation of the study's purpose, activities, foreseeable risks, data collected, retention period, and their right to decline or withdraw according to the approved protocol.

The researchers will collect only information necessary for the study. Evaluation records will use participant codes where feasible and will be stored in an access-controlled location for **[approved retention period]**. The final report will not include passwords, service credentials, private receipt images, private PDFs, or identifiable account and study data.

Testing will use an isolated environment and synthetic or specifically authorized data. Production credentials and live member records will not be used for test automation. External AI processing will be disclosed and governed by school approval. Contribution text or user prompts sent to an external provider must be handled according to the system's privacy disclosures and the approved research protocol. Receipt images are processed for reference suggestion in the browser in the current implementation; staff remain responsible for payment confirmation.

The researchers will distinguish authorization from copy prevention: users may only retrieve protected resources when the system authorizes them, but an authorized display cannot be guaranteed immune to screenshots or recording. Participants must be informed of this limitation where relevant.

### 3.12 Methodological Limitations

The evaluation findings will depend on the number and composition of participants, the selected tasks, the devices and network conditions, the test data, and the duration of observation. A limited usability sample may provide useful formative feedback but may not represent every student or faculty member. Test-environment results may not predict production availability or load. Optional third-party AI behavior may vary over time and may be unavailable during testing. The system's OCR and AI outputs are advisory and cannot establish payment authenticity, academic correctness, originality, or copyright status.

Any features not tested, integrations not verified, or quality characteristics not measured will be identified explicitly in the results and conclusion. The study will not generalize beyond the evidence collected.

---

## Before submission: completion checklist for the researchers

- Obtain adviser approval for the proposed correction from Gemini receipt extraction to browser-side OCR and for the matching privacy description.
- Add verified citations to Chapter 1's background and any adopted definitions or standards; complete the reference list in the school's required style.
- Confirm Mary the Queen College process descriptions using documented, approved field evidence.
- Replace every bracketed placeholder, especially locale, approved research design, target population, actual sample, sampling method, dates, instruments, and ethics approval.
- Confirm whether the evaluated version was deployed and identify the exact environment; report deployment as completed only with evidence.
- Select performance thresholds and ISO/IEC 25010 characteristics/edition with the adviser before evaluation.
- Use the standard SUS questionnaire/scoring only if it is part of the approved protocol.
- Keep intended benefits, requirements, implementation status, test results, and conclusions clearly distinguished throughout the final manuscript.
