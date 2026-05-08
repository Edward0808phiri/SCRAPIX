# Answers to Tender Questions

---

## B2. Describe your experience in building React-based user interfaces for data presentation or dashboard applications

We have extensive experience building React-based data dashboards and visualization interfaces for regulatory compliance and financial data applications. Our approach includes:

**Technical Experience:**
- **Component-Based Architecture**: We build modular, reusable UI components using React functional components with hooks (useState, useEffect, useContext, useMemo) for state management and side effects
- **Data Visualization**: Proficient with charting libraries including Recharts, Chart.js, and D3.js for rendering time-series data, trend analysis, and regulatory update timelines
- **Real-Time Data Integration**: Experience integrating with Supabase real-time subscriptions, WebSocket connections, and REST APIs for live dashboard updates
- **State Management**: Implemented solutions using React Context, Redux Toolkit, and Zustand for complex application state
- **Data Tables**: Built interactive data grids with sorting, filtering, pagination, and export functionality using libraries like TanStack Table (React Table)

**Relevant Dashboard Features Built:**
- Regulatory news aggregation dashboards displaying headlines from 45+ global regulatory sources
- Filtering interfaces by region (UK, EU, US, APAC), regulator type, and date ranges
- Alert notification panels for critical regulatory updates
- Historical trend visualization for publication patterns
- Export functionality (CSV, PDF) for compliance reporting

**UI/UX Practices:**
- Responsive design using Tailwind CSS and CSS Grid/Flexbox
- Accessibility compliance (WCAG 2.1 AA)
- Dark/light theme support
- Loading states, error boundaries, and skeleton loaders for optimal UX

---

## B4. Describe your approach to handling changes in website structure (e.g., DOM changes) that may affect scraping reliability

We employ a multi-layered resilience strategy to handle DOM changes and maintain scraping reliability:

**1. Flexible Selector Strategies:**
- Use multiple fallback selectors (CSS, XPath, text content matching)
- Prefer semantic selectors (ARIA labels, data attributes, class name patterns) over brittle positional selectors
- Implement selector chains that try alternatives when primary selectors fail

**2. Monitoring & Alerting:**
- Automated health checks that validate expected page structures
- Screenshot capture on failures for rapid debugging (we maintain a `/screenshots` folder for this purpose)
- Logging with detailed error context including URL, timestamp, and attempted selectors
- Slack/email alerts when scraper success rates drop below thresholds

**3. Adaptive Scraping Techniques:**
```javascript
// Example: Multiple selector fallback pattern we use
const selectors = [
  'article.news-item h2 a',           // Primary selector
  '[data-testid="headline"] a',       // Data attribute fallback
  '.search-item__clickthrough',       // Class-based fallback
  'a[href*="/news/"]'                 // URL pattern fallback
];

for (const selector of selectors) {
  const elements = await page.$$(selector);
  if (elements.length > 0) return elements;
}
```

**4. Content Validation:**
- Validate extracted data against expected schemas (minimum title length, valid URLs, date formats)
- Flag anomalies for manual review rather than inserting potentially corrupt data
- Compare current results against historical baselines

**5. Rapid Response Process:**
- Maintain source-specific configuration files that can be updated without code deployment
- Version control all selector configurations for easy rollback
- Document each regulator's page structure patterns for faster debugging

**6. Proactive Maintenance:**
- Weekly automated checks even when no failures occur
- Monitor target websites for redesign announcements
- Maintain relationships with API alternatives where available (e.g., RSS feeds, official APIs)

---

## B5. Outline your proposed development methodology and how you will manage delivery within the 6-week timeline

**Methodology: Agile Scrum with 1-Week Sprints**

We propose a structured Agile approach with clear milestones and continuous delivery:

### Sprint Breakdown

| Week | Sprint Focus | Deliverables |
|------|--------------|--------------|
| **1** | Foundation & Architecture | Environment setup, database schema, CI/CD pipeline, authentication scaffolding |
| **2** | Core Scraping Infrastructure | Scraper framework, first 10 regulatory sources live, data validation layer |
| **3** | API & Backend Services | REST API endpoints, data aggregation logic, error handling, logging |
| **4** | Frontend Dashboard (MVP) | React dashboard UI, data tables, basic filtering, real-time updates |
| **5** | Advanced Features & Integration | All 45+ sources, advanced filters, alerting system, export functionality |
| **6** | Testing, Polish & Deployment | UAT, performance optimization, documentation, production deployment, handover |

### Delivery Management Practices

**Daily:**
- 15-minute standups (async via Slack if needed)
- Continuous integration with automated tests on every commit

**Weekly:**
- Sprint demo to stakeholders every Friday
- Sprint retrospective and planning
- Updated burndown charts and progress reports

**Risk Mitigation:**
- Buffer time built into Week 6 for unforeseen issues
- Priority-ranked backlog allows scope adjustment without derailing core delivery
- Parallel workstreams (backend/frontend) to maximize velocity

**Communication:**
- Dedicated Slack channel for real-time collaboration
- Weekly written status reports
- Immediate escalation protocol for blockers

**Tools:**
- GitHub for version control with branch protection and PR reviews
- GitHub Projects or Jira for sprint management
- Vercel/Railway for staging deployments after each sprint

---

## C2. Describe the measures you take to ensure secure coding practices and protect against common vulnerabilities (e.g., OWASP Top 10)

We implement comprehensive security measures aligned with OWASP Top 10 and industry best practices:

### OWASP Top 10 Mitigations

| Vulnerability | Our Mitigation |
|---------------|----------------|
| **A01: Broken Access Control** | Role-based access control (RBAC), row-level security in Supabase, JWT token validation, principle of least privilege |
| **A02: Cryptographic Failures** | TLS 1.3 for all communications, secrets in environment variables (never in code), encrypted database connections |
| **A03: Injection** | Parameterized queries (Supabase client handles this), input validation, output encoding |
| **A04: Insecure Design** | Threat modeling during design phase, security requirements in user stories |
| **A05: Security Misconfiguration** | Infrastructure as Code, automated security scanning, no default credentials, disabled unnecessary features |
| **A06: Vulnerable Components** | Automated dependency scanning (npm audit, Dependabot), regular updates, SBOM maintenance |
| **A07: Authentication Failures** | Supabase Auth with MFA support, secure session management, account lockout policies |
| **A08: Data Integrity Failures** | Signed commits, CI/CD pipeline integrity checks, code review requirements |
| **A09: Logging & Monitoring** | Comprehensive audit logs, anomaly detection, security event alerting |
| **A10: SSRF** | URL validation for scraper targets, allowlisting of permitted domains, no user-controlled URLs in server requests |

### Secure Development Practices

- **Code Reviews**: All code requires peer review before merging
- **Static Analysis**: ESLint security plugins, Semgrep for vulnerability detection
- **Secrets Management**: Environment variables via `.env` files (gitignored), secrets never committed
- **Dependency Management**: Lock files committed, automated vulnerability alerts
- **Security Headers**: Helmet.js for Express applications (CSP, HSTS, X-Frame-Options)

### Example from Our Codebase
```javascript
// We use environment variables for all sensitive configuration
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
```

---

## C3. Describe your data breach notification and incident response procedures

We maintain a documented Incident Response Plan aligned with UK GDPR Article 33 requirements:

### Incident Response Phases

**1. Detection & Identification (0-1 hours)**
- Automated monitoring alerts for anomalous access patterns
- Clear escalation paths for team members who identify potential breaches
- Initial severity classification (Critical/High/Medium/Low)

**2. Containment (1-4 hours)**
- Isolate affected systems to prevent further data exposure
- Revoke compromised credentials immediately
- Preserve forensic evidence (logs, snapshots)
- Activate incident response team

**3. Assessment (4-24 hours)**
- Determine scope: what data, how many records, which data subjects
- Identify root cause and attack vector
- Assess risk to individuals' rights and freedoms
- Document findings in incident log

**4. Notification (Within 72 hours of awareness)**
- **ICO Notification**: If breach likely results in risk to individuals
  - Report via ICO's online portal within 72 hours
  - Include: nature of breach, categories of data, approximate numbers, likely consequences, measures taken
- **Data Subject Notification**: If high risk to individuals
  - Clear, plain language communication
  - Description of breach and likely consequences
  - Measures taken and recommended protective actions

**5. Remediation & Recovery**
- Patch vulnerabilities
- Restore systems from clean backups
- Enhanced monitoring for the affected period
- Update security controls to prevent recurrence

**6. Post-Incident Review**
- Root cause analysis
- Lessons learned documentation
- Update incident response procedures
- Staff retraining if required

### Documentation & Compliance
- All breaches logged in Incident Register (including those not requiring ICO notification)
- Retain records for minimum 5 years
- Annual review and testing of incident response procedures

---

## C4. Confirm your organisation's compliance with UK GDPR and the Data Protection Act 2018. Do you have a designated Data Protection Officer?

### Compliance Confirmation

We confirm full compliance with:
- **UK General Data Protection Regulation (UK GDPR)**
- **Data Protection Act 2018**
- **Privacy and Electronic Communications Regulations (PECR)** where applicable

### Our Compliance Framework

**Lawful Basis for Processing:**
- Clear identification of lawful basis for all processing activities
- Documented in our Records of Processing Activities (ROPA)
- Primarily legitimate interests and contractual necessity for B2B regulatory data services

**Data Protection Principles (Article 5):**
- ✅ Lawfulness, fairness, transparency
- ✅ Purpose limitation
- ✅ Data minimisation
- ✅ Accuracy
- ✅ Storage limitation
- ✅ Integrity and confidentiality
- ✅ Accountability

**Technical & Organisational Measures:**
- Privacy by Design embedded in development processes
- Data Protection Impact Assessments (DPIAs) for high-risk processing
- Encryption at rest and in transit
- Access controls and audit logging
- Regular staff training on data protection

**Data Subject Rights:**
We have processes to respond to:
- Right of access (Subject Access Requests)
- Right to rectification
- Right to erasure
- Right to restrict processing
- Right to data portability
- Right to object

### Data Protection Officer

**DPO Status:** [To be completed - options below]

*Option A (if DPO appointed):*
> Yes, we have a designated Data Protection Officer:
> - Name: [DPO Name]
> - Contact: [dpo@company.com]
> - Registered with ICO: Yes

*Option B (if no DPO but not required):*
> Based on our assessment, we are not required to appoint a DPO under Article 37 UK GDPR as we do not:
> - Carry out large-scale systematic monitoring of individuals
> - Process special category data at large scale
> - Act as a public authority
>
> However, we have appointed a designated Data Protection Lead who maintains oversight of our compliance programme and is the point of contact for data protection matters:
> - Name: [Contact Name]
> - Email: [privacy@company.com]

### ICO Registration
- Registered with the Information Commissioner's Office
- Registration Number: [Your ICO Registration Number]

---

*Document prepared for tender submission*  
*Last updated: [Date]*
