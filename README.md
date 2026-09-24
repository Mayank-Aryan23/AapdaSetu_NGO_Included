# 🚨 AapdaSetu — AI-Powered Disaster Management & Response System

AapdaSetu is a **full-stack, AI-powered disaster management and response ecosystem** designed to bridge the gap between **citizens, authorities, NGOs, and real-time disaster intelligence**.

The platform combines a **citizen mobile application, automated disaster alert processing, AI-powered intelligence, an administrative control platform, and a dedicated NGO response portal** to support faster and more coordinated disaster response.

---
# 📥 Download APK

Download the latest Android APK from the **GitHub Releases** section.

👉 **Latest Release**

https://github.com/Ayush-620/AapdaSetu-Mobile/releases/latest

# Website Access 
https://aapdasetu-ngo-included.onrender.com/

**Credential for Login on Website**
**For Admin**
ID: admin@ndma.gov.in
Password: admin123#1@

**For NGO**
ID: NGO-TEST-002
Password: test123

## 🎯 Problem Statement

During disasters, critical information is often scattered across weather agencies, government alerts, citizens, social media, and field-level organizations.

Citizens may struggle to report emergencies or reach the appropriate organization, while authorities and NGOs may receive fragmented information without a centralized view of incidents.

This creates an **information-to-action gap** — information may be available, but it is not always converted into timely and actionable response.

### AapdaSetu aims to solve this by connecting:

**Citizen → Intelligence → Coordination → Response**

---

## 💡 How AapdaSetu Works

The platform creates a connected disaster-response ecosystem:

```text
Citizen Mobile App
        ↓
   Supabase Backend
        ↓
 AI + Automated Intelligence
        ↓
 ┌───────────────┬────────────────┐
 ↓               ↓                ↓
Admin Platform   NGO Portal    Alert System
 ↓               ↓
Coordination     Response
        ↓
   Disaster Assistance
```

Citizens can report incidents with their **location, description, images, and audio**, while AI and automated systems help process disaster information.

Verified NGOs can access relevant citizen reports through their dedicated portal and coordinate response actions.

---

# 📱 Citizen Mobile Application

The AapdaSetu mobile application is designed as the primary interface for citizens during emergencies.

### Citizens can:

- 🚨 Report disasters and emergency incidents
- 📍 Share their location
- 📝 Provide incident descriptions
- 📷 Upload images
- 🎙️ Upload audio reports
- 🔔 Receive disaster alerts
- 🤖 Interact with an AI Disaster Assistant
- 📡 Support offline-first data handling and synchronization

The application can be used for incidents such as:

- Floods
- Fire
- Medical emergencies
- Rescue requirements
- Local disaster incidents
- Other emergency situations

---

# 🤖 AI Disaster Assistant

AapdaSetu integrates **Google Gemini** to provide an AI-powered disaster assistance layer.

The assistant can provide context-aware guidance using available information such as:

- User location
- Nearby disaster alerts
- Conversation history
- Available disaster information

The objective is to provide users with useful safety guidance while they navigate an emergency situation.

---

# 🔁 Automated Disaster Alert System

AapdaSetu uses **n8n-based automation** to process disaster-related information from official sources.

The automated pipeline:

```text
Official Sources
      ↓
     n8n
      ↓
   AI Analysis
      ↓
Threat Detection
      ↓
Structured Alert
      ↓
   Supabase
      ↓
Admin / Citizen Systems
```

The system periodically collects information, processes it using AI, identifies potentially important threats, extracts structured information, and stores the resulting alerts in Supabase.

---

# 🛠️ Admin Control Platform

The Admin Platform acts as the centralized operational control center for the disaster management system.

### 📊 Dashboard

Provides an overview of:

- Active alerts
- Citizen reports
- System status
- Ongoing operations
- Quick operational actions

### 🚨 Alert Monitoring

Administrators can:

- View AI-generated alerts
- View citizen-generated alerts
- Filter alerts
- Inspect detailed alert information
- Monitor disaster situations by location and severity

### 🚑 Resource Allocation

The platform supports:

- Assigning rescue teams
- Deploying emergency resources
- Managing response operations
- Tracking response progress

### 🧠 AI Mesh Network

The AI Mesh layer supports intelligent coordination and data routing between citizens, operational systems, and response organizations.

### 📈 Analytics

The platform provides analytical capabilities for:

- Disaster trends
- Region-wise impact
- Response information
- Resource utilization
- AI-generated insights

---

# 🚑 NGO Response Portal

AapdaSetu includes a dedicated **NGO Response Portal** that connects verified NGOs with citizen-reported incidents.

This component extends the system from simply **collecting disaster information** to supporting actual **response coordination**.

### NGO Portal capabilities include:

- View citizen-reported incidents
- Inspect incident details and location
- Identify cases requiring assistance
- Take responsibility for an open case
- Add response/contact information
- Maintain operational notes
- Track active responses
- Complete cases after assistance
- Release cases when another organization needs to handle them
- View response history and operational information

NGO access is controlled through a verification process. NGOs first contact the AapdaSetu team, and verified organizations receive access to their dedicated portal.

---

# 🌊 Bihar Flood Deployment

During the recent **Bihar flood situation**, a functional part of AapdaSetu was made live specifically to support NGO-based disaster response.

Citizens were able to:

**Report flood-related incidents → Request help → Share incident information**

Participating NGOs were then able to:

**View reports → Understand the situation → Take cases → Coordinate assistance**

This allowed AapdaSetu to demonstrate a practical **citizen-to-NGO response workflow during an ongoing disaster situation**.

The Bihar deployment also introduced location-based state classification so that reports originating within Bihar could be identified and handled appropriately within the response system.

---

# 🏗️ System Architecture

```text
                    ┌─────────────────────┐
                    │   Citizen Mobile    │
                    │        App          │
                    └──────────┬──────────┘
                               │
                               ↓
                    ┌─────────────────────┐
                    │      Supabase       │
                    │ Database + Auth     │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ↓                ↓                ↓
       ┌────────────┐   ┌────────────┐   ┌─────────────┐
       │    AI      │   │    n8n     │   │    NGO      │
       │ Intelligence│   │ Automation │   │   Portal    │
       └──────┬─────┘   └──────┬─────┘   └──────┬──────┘
              │                │                │
              └────────────────┼────────────────┘
                               ↓
                    ┌─────────────────────┐
                    │   Admin Platform    │
                    │   Control Center    │
                    └──────────┬──────────┘
                               ↓
                    ┌─────────────────────┐
                    │ Disaster Response   │
                    │   & Coordination    │
                    └─────────────────────┘
```

---

# 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Mobile Application | Flutter |
| Web Platform | HTML, CSS, JavaScript |
| Backend & Database | Supabase |
| Authentication | Supabase Authentication |
| AI | Google Gemini |
| Automation | n8n |
| Local Storage | Hive |
| Location Services | Geolocator |
| Maps & Location Visualization | Google Maps |
| Deployment | Cloud Run |

---

# 🔐 Security & Access

AapdaSetu uses controlled access to separate different parts of the ecosystem.

### Access levels include:

- **Citizen** — Report incidents, receive alerts, and access assistance features.
- **Verified NGO** — Access assigned response operations through the NGO portal.
- **Administrator** — Manage alerts, resources, reports, analytics, and system operations.

Authentication and role-based access are used to control access to the respective platform components.

> **Security Note:** API keys, service-role credentials, passwords, and other secrets should never be committed to this repository. Configure them through environment variables or deployment-platform secret settings.

---

# 🚀 Key Features

- 🚨 Real-time disaster reporting
- 📍 Location-based incident information
- 📱 Citizen emergency reporting
- 🚑 NGO-based response coordination
- 🤖 AI-powered disaster assistance
- 🧠 AI-assisted alert analysis
- 🔁 Automated disaster alert processing
- 📊 Centralized administrative control
- 📈 Disaster analytics
- 📡 Offline-first mobile architecture
- 🔐 Role-based access
- 🌊 Real-world Bihar flood response deployment

---

# 🎯 Objective

The core objective of AapdaSetu is to reduce the time between:

> **“Someone needs help”**

and

> **“The right organization knows about it and can act.”**

By bringing together **citizen reporting, AI intelligence, automated alerts, administrative coordination, and NGO response operations**, AapdaSetu aims to create a more connected and actionable disaster response ecosystem.

---

## 👥 Project

**AapdaSetu**  
*AI-Powered Disaster Management & Response System*

Built as a student-led initiative to explore how **AI, automation, real-time reporting, and coordinated response systems** can be combined to support disaster management and public safety.
