# Bluetorn Core

Build a premium, minimalist, modern FRONTEND-ONLY CRM prototype for a product called BLUETORN CRM.

This is a UI/UX and architecture validation prototype only.

Do NOT build real backend logic, real API calls, real database logic, real authentication, or real integrations.

Use realistic mock data, local UI interactions, reusable components, and clean route-based architecture.

PRODUCT CONTEXT

- Product name: BLUETORN CRM

- Tagline: Work faster. Sell smarter.

- Philosophy: Manage customers. Not software.

- Brand logo: Use the official attached BLUETORN logo exactly as provided. Do not redesign, replace, distort, recolor, simplify, or recreate it.

- Style: Minimalist, premium, clean, modern, high-trust, business-focused

- Audience: Non-technical small business owners, agencies, service businesses, traders, manufacturers, retail stores, startup founders

- Initial industry focus: Real Estate

- Product type: Multi-tenant CRM UI prototype

- Language: English

- Currency support: Multi-currency UI

- Date format: DD/MM/YYYY

- Time format: 12-hour format

- Theme: Light mode and dark mode support

PRIMARY GOAL

Create a frontend CRM prototype that helps us validate:

- navigation structure

- business flow clarity

- real-estate-first architecture

- login media concept

- workspace/tenant concept

- role-based UI

- simplicity

- premium feel

- mobile responsiveness

- usability for non-technical business owners

CORE DESIGN PRINCIPLES

- Keep the interface simple enough to understand within minutes

- Avoid feature bloat

- Avoid enterprise clutter

- Avoid generic admin-template styling

- Use strong hierarchy, clear spacing, polished typography

- Use subtle shadows, borders, and micro-interactions

- Make it feel like a real production SaaS product

- Keep it mobile responsive from the beginning

- Use accessible UI patterns

- Respect reduced-motion preferences

- Use reusable UI components everywhere

APP ARCHITECTURE

Create 3 distinct experiences:

1. Client CRM App

2. Super Admin Area

3. Login Experience with promotional media

CLIENT APP ROUTES

- Home

- Customers

- Leads

- Properties

- Tasks

- Calendar

- Finance

  - Invoices

  - Payments

- Reports

- Settings

SUPER ADMIN ROUTES

- Admin Dashboard

- Workspaces

- Workspace Detail

- Create Workspace

- Users

- Plans

- Promotional Media

- System Logs

- Audit Logs

- Admin Settings

LOGIN EXPERIENCE

Desktop login layout:

- Left side: 60% width

- Right side: 40% width

Left side:

- Promotional media area

- This should automatically rotate through images, posters, and videos in a smooth premium loop

- Show feature announcements, launch posters, product highlights, and short videos

- Make it feel like a curated announcement wall, not a random carousel

- Include smooth transitions

- Include muted autoplay video behavior visually

- Include pause/play controls for accessibility

- Include scheduling and priority concepts visually

- Allow admin-managed promotional content cards in the UI

- Show mock metadata such as media priority, status, schedule, and target workspace

Right side:

- Login form

- Show BLUETORN logo at the top

- Fields:

  - Workspace Code

  - User ID

  - Password

- Buttons:

  - Login

  - Forgot Password

- No sign up button

- No unnecessary clutter

- Keep the form premium, clean, and simple

Mobile login:

- Do not force the 60/40 split on mobile

- Use a stacked mobile-friendly login layout

- Show logo, login form, and promotional media in a compact responsive way

LOGIN EDGE STATES TO INCLUDE

- Invalid password state

- Workspace inactive state

- User locked state

- Forgot password flow

- Permission denied state after login

- Loading state

- Empty state / first-time login state

WORKSPACE / TENANT CONCEPT

- The app must clearly feel multi-tenant

- Include workspace awareness in the header

- Show current workspace name and workspace code

- Include a workspace switcher UI concept if multiple workspaces are available

- Separate client workspace UI from Super Admin UI visually and structurally

- Show mock workspace status, plan, owner, industry, and active/inactive state

USER ROLES

Client App:

- Owner

- Manager

- Employee

Platform Admin:

- Super Admin

ROLE-BASED UI

- Owner sees full business controls

- Manager sees team and operational controls

- Employee sees assigned work only

- Super Admin sees platform control tools only

HOME / DASHBOARD

- Show an overview of the business

- Make it actionable, not just analytical

- Include cards for:

  - New Leads

  - Pending Follow-ups

  - Tasks Due Today

  - Upcoming Visits

  - Revenue

  - Pending Payments

- Include sections for:

  - Today’s schedule

  - Recent activity

  - Lead pipeline snapshot

  - Pending finance items

- Include a subtle AI Insights placeholder card for future validation only, but do not create a standalone AI module yet

- Make primary actions obvious and clickable

CUSTOMERS

- Clean customer list page

- Include search, filters, saved views, and a primary Add Customer button

- Customer list should show:

  - Name

  - Phone

  - Type

  - Assigned User

  - Last Activity

  - Status

- Customer detail page should include:

  - Overview

  - Timeline

  - Leads

  - Properties

  - Tasks

  - Invoices

  - Payments

  - Notes

- Show quick action buttons:

  - Call

  - WhatsApp

  - Email

  - Next Action

- Add activity timeline and relationship timeline

- Include archive state instead of hard delete state in the UI

LEADS

- Create lead list, lead detail, and pipeline views

- Lead sources should include:

  - Website

  - WhatsApp

  - Facebook

  - Instagram

  - LinkedIn

  - Google Ads

  - Meta Ads

  - Referral

  - Advertisement

  - Landing Page

  - Manual Entry

  - API

- Lead statuses:

  - New

  - Contacted

  - Interested

  - Visit / Meeting

  - Negotiation

  - Won

  - Lost

- Lead list should show source badges, campaign badges, assigned user, status, and next follow-up

- Lead detail page should include:

  - Lead header

  - Contact actions

  - Next follow-up

  - Interested property

  - Status

  - Timeline

  - Notes

  - Tasks

  - Visits

  - Source attribution

  - Campaign attribution

- Include a “Match Properties” UI section to validate lead-to-property workflow

- Include duplicate lead warning UI concept

- Pipeline should be visually clear and simple

AUTOMATIC LEAD CAPTURE VALIDATION

Show mock UI concepts for leads coming automatically from:

- Facebook Ads

- Instagram Ads

- Google Ads

- Website forms

- Landing pages

- WhatsApp

The UI should clearly display:

- source

- campaign

- external lead ID

- received time

- assigned user

- status

PROPERTIES

- Real-estate-first module

- Create property list, property detail, and site visit flow

- Property cards should show:

  - Image

  - Name

  - Location

  - Price

  - Type

  - Area

  - Status

- Statuses:

  - Available

  - Reserved

  - Booked

  - Sold

- Property detail page should include:

  - Images

  - Details

  - Interested Leads

  - Site Visits

  - Owner

  - Documents

  - Activity

- Include property filters and sorting

- Show archive state instead of hard delete state

- Make property cards premium and visual

SITE VISITS

- Include site visit scheduling UI

- Show visit date, time, lead, property, assigned user, and status

- Show visit timeline / feedback

- Make it feel natural inside the property/lead workflow

TASKS

- Simple task management

- Show Today, Upcoming, and Completed sections

- Task cards should show:

  - Title

  - Due time

  - Assigned user

  - Related record

- Make quick creation easy

- Show archive/completion states clearly

CALENDAR

- Show tasks, follow-ups, site visits, meetings, and payment due dates

- Provide Day, Week, and Month views

- Keep the calendar clean and readable

- Use subtle color differentiation for event types

FINANCE

Invoices:

- Include invoice list and invoice detail screens

- Show invoice number, customer, amount, due date, and status

- Statuses:

  - Draft

  - Sent

  - Partially Paid

  - Paid

  - Overdue

  - Cancelled

- Include create invoice UI, item rows, tax, discount, total, multi-currency display, and PDF-style preview feel

Payments:

- Show payment list and payment detail

- Include payment status, method, reference, date, linked invoice, and currency

- Keep finance visually simple and trustworthy

REPORTS

- Show simple, premium analytics

- Include:

  - Leads

  - Lead Sources

  - Sales

  - Revenue

  - Finance

  - Team Performance

- Avoid overcrowded charts

- Only use charts that help decision-making

- Make reports easy to read for non-technical users

SETTINGS

- Keep settings minimal and structured

- Include:

  - Business

  - Users

  - Integrations

  - Notifications

  - Billing

  - Security

  - Preferences

- Business settings should show:

  - Business name

  - Logo

  - Phone

  - Email

  - Address

  - Currency

  - Date format

  - Time format

- Users page should allow manual creation of multiple users

- Roles:

  - Owner

  - Manager

  - Employee

INTEGRATIONS

Create a clean integrations section with mock setup and status cards for:

- WhatsApp Business

- Gmail

- Google Meet

- Zoom

- Meta

- Google Ads

- Razorpay

For each integration, show:

- connected / disconnected state

- setup status

- source mapping

- webhook or sync concept

- reconnect / test connection buttons

- integration health state

PROMOTIONAL MEDIA ENGINE

This is a key differentiator.

Create a dedicated admin-managed promotional media system that powers the login page.

Media types:

- Poster

- Image

- Video

Admin UI should support:

- Add media

- Preview media

- Schedule media

- Priority control

- Active / inactive state

- Target global or specific workspace

- Reorder media

- Archive media

- Delete media conceptually, but show archive as the preferred state

Login page media experience:

- Smooth loop

- Premium transitions

- Mix of posters and videos

- Mute autoplay visual concept

- Pause/play control

- Curated content, not random carousel

SUPER ADMIN AREA

Create a separate admin experience for BLUETORN internal use:

- Admin Dashboard

- Workspaces

- Workspace Detail

- Create Workspace

- Users

- Plans

- Promotional Media

- System Logs

- Audit Logs

- Admin Settings

Admin capabilities conceptually shown in the UI:

- Create workspaces

- Generate workspace code

- Manage owners

- Manage promotional media

- Schedule login media content

- View logs

- Manage plans

- Suspend or activate workspaces

WORKSPACE CREATION UI

Create a clear admin flow for:

- Business name

- Industry

- Owner name

- Owner email

- Phone

- Plan

- Workspace code generation

- Workspace status

- Create workspace action

INDUSTRY TEMPLATE CONCEPT

Show that the product is core CRM plus an industry layer.

Initial focus:

- Real Estate

Future-ready template placeholders:

- Agency

- Retail

- Manufacturing

- Service business

- Trading

- Startup

EMPTY STATES

Every major page should have a premium empty state with:

- friendly text

- clear CTA

- no dead ends

- no blank screens

LOADING STATES

Use:

- skeleton loaders

- soft placeholders

- minimal loading text

- polished transition states

ERROR / ACCESS STATES

Include UI concepts for:

- page not found

- permission denied

- workspace inactive

- integration disconnected

- form validation error

- no search results

- failed login

- expired session

UX REQUIREMENTS

- Premium SaaS layout patterns

- Clear sidebar and top header

- Global search UI

- Command palette trigger

- Quick add button

- Obvious primary actions

- Clear empty states

- Polished loading skeletons

- Responsive tables/cards

- Simple forms

- Consistent buttons, badges, cards, tabs, and modals

- Avoid clutter and excessive animation

- Every screen should feel like a real business product

- Make the interface feel understandable within minutes

NAVIGATION REQUIREMENTS

Desktop:

- Left sidebar

- Top header

- Workspace indicator

- Profile menu

- Search

- Notifications

Mobile:

- Bottom navigation

- Thumb-friendly quick actions

- Cards instead of dense tables when needed

GLOBAL SEARCH

- Add a command palette style global search

- Allow searching across:

  - customers

  - leads

  - properties

  - invoices

  - payments

  - tasks

  - users

- Include recent searches and quick actions

- Make search fast and premium

ADDITIONAL PRODUCT VALIDATION UI

Add subtle mock placeholders for future features where useful, but do not create full modules yet:

- AI insights on lead/customer detail

- Saved filters

- Recycle/archive state

- Activity timeline

- Team performance overview

MOBILE REQUIREMENTS

- Fully responsive

- Convert sidebar to mobile navigation

- Keep primary actions thumb-friendly

- Ensure cards stack cleanly

- Keep login usable on small screens

- Convert tables to cards where necessary

- Keep finance and lead workflows readable on mobile

DATA REQUIREMENTS

Use realistic mock data for:

- Leads

- Customers

- Properties

- Tasks

- Invoices

- Payments

- Users

- Workspaces

- Promotional media

- Admin logs

- Integration status

- Dashboard metrics

IMPORTANT BEHAVIOR RULES

- Do not implement backend logic

- Do not implement real API calls

- Do not implement real auth

- Do not implement real integrations

- Do not make the product feel like a generic admin panel

- Do not add enterprise bloat

- Do not add SMS or WhatsApp notifications yet

- Do not add advanced automation yet

- Do not add white label yet

- Do not add forecasting complexity

- Do not copy Salesforce, Zoho, or HubSpot UI patterns directly

TECHNICAL PREFERENCES

- Prefer reusable components

- Prefer clean folder structure

- Use TypeScript if supported

- Use modern component architecture

- Use consistent naming

- Use mock data structures that can later be replaced with real APIs

- Use accessible UI patterns

- Use premium spacing and typography

EXPECTED OUTPUT

Build a full frontend CRM prototype with:

- clean routing

- reusable components

- polished UI

- realistic mock data

- responsive behavior

- workspace-aware architecture

- role-based UI concepts

- admin-managed login promotional media

- real-estate-first CRM structure

- professional business feel

The final result should help us test whether the CRM architecture is correct, what feels confusing, what needs upgrading, and what should be improved before real implementation.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://bluetorn-crm.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cfc8a9f2-29cf-4482-9df4-e86fb4cce736).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
