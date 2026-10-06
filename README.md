# UCSB × Unwrap Capstone Project: Real-Time Website Surveys

## Overview

Traditional surveys are often delivered only after a user has completed or abandoned a task, requiring them to recall what went wrong from memory. This delay reduces the accuracy and richness of the feedback, making usability issues harder to diagnose.

This capstone project develops an embeddable browser SDK that can be installed on an existing website through a single script tag. The SDK will render a configurable survey widget, detect user-friction events, trigger contextual surveys using configurable targeting rules, and transmit responses with session and event metadata to a database.

## Example Scenario

Dahlia was trying to approve student timecards in Oracle but could not continue because the "Submit" button was greyed out with no clear explanation. She had no quick way to flag the issue to the Oracle team for assistance.

The proposed system would allow a website to detect this type of friction in real time and invite the user to provide contextual feedback.

## Expected Deliverable

Students will build an embeddable browser SDK with the following capabilities:

- Installation on an existing website using a single script tag
- Configurable survey widget rendering
- Detection of selected user-friction events
- Contextual survey triggers based on configurable targeting rules
- Secure transmission of survey responses and relevant metadata to a database

## Stretch Deliverable

Students may also build a dashboard that visualizes aggregated survey responses and contextual metadata. Potential capabilities include:

- Clustering open-text responses into themes
- Correlating context fields such as browser, page, and time of day with complaint types
- Identifying anomalies or recurring failure patterns
- Surfacing possible causes of usability issues

## Project Roadmap

The project will progress through five areas:

1. **Research:** Analyze the competitive landscape, intended infrastructure, and technical limitations.
2. **Trigger Design:** Identify friction, error, abandonment, and explicit signals, then compare polling and event-driven detection.
3. **Frontend Widget:** Build a configurable survey popup with dynamic, trigger-specific questions.
4. **Context Collection:** Capture useful metadata while excluding sensitive information and applying redaction where necessary.
5. **Analysis:** Aggregate responses, identify recurring issues, and visualize key patterns.

## Team Members

- Erik Rodriguez — erik_rodriguez@ucsb.edu
- Wendy Contreras Martinez — wcontrerasmartinez@ucsb.edu
- Longjiao Chen — longjiao@ucsb.edu
- Arjun Malaviya — arjunmalaviya@ucsb.edu
- Nic Santos — nxs@ucsb.edu

## Unwrap Partners

- [Max Dekle](https://www.linkedin.com/in/max-dekle/) — SDE, NLP Team
- [Ashwin Singhania](https://www.linkedin.com/in/ashwin-singhania-53b6a72a/?lipi=urn%3Ali%3Apage%3Ad_flagship3_search_srp_all%3BrUy8poTBQUC8auetSHF9cg%3D%3D) — Co-Founder
- [Johnny Manzo](https://www.linkedin.com/in/johnlmanzo/?lipi=urn%3Ali%3Apage%3Ad_flagship3_search_srp_all%3BFlu%2F5KU6QVe99lEjVVs8%2BQ%3D%3D) — GM of New Products, Surveys Team
- [Franco Muniz](https://www.linkedin.com/in/francomuniz/?lipi=urn%3Ali%3Apage%3Ad_flagship3_search_srp_all%3BhZDLHMzmTluC3crZZXxulw%3D%3D) — SDE, Surveys Team
- [Isaac Song](https://www.linkedin.com/in/isaaczsong/?lipi=urn%3Ali%3Apage%3Ad_flagship3_search_srp_all%3Bju4LX0q4TKOXXmEnbeP9Hg%3D%3D) — SDE, Surveys Team

## Project Status

This repository is currently being set up for the capstone project.

## Getting Started

Follow the project documentation and sprint assignments for setup instructions and implementation guidance.
