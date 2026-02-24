# 🚀 Courage Library  
### Production-Ready Self-Paced Learning SaaS Platform

A full-stack SaaS platform built with secure authentication, server-side pricing logic, payment verification, and idempotent enrollment design.

🔗 Live: https://www.couragelibrary.in  
👨‍💻 Author: Jan Mohammad  

---

## 🧠 What This Project Demonstrates

- Server-authoritative pricing
- Secure payment integration (Razorpay)
- Coupon validation engine
- Free-plan abuse prevention
- Idempotent enrollment logic
- Database-level integrity enforcement
- Production-grade SaaS architecture

---

## 🏗️ Architecture Overview

```
Client (JS + Tailwind)
        ↓
Supabase Auth (JWT Session)
        ↓
Supabase Edge Functions (Business Logic)
        ↓
PostgreSQL (Plans, Coupons, Enrollments)
        ↓
Razorpay REST API (Order Creation)
```

**Design Principle:**  
The client never decides price, discount, or access.  
All critical business logic runs server-side.

---

## 🔐 Authentication & Authorization

- Email/password authentication (Supabase Auth)
- Session persistence
- Password recovery flow
- Auth state synchronization
- Role-based access control
- Enrollment APIs require authenticated context

---

## 💳 Secure Enrollment Flow

1. User selects plan  
2. Server calculates final price  
3. Coupon validated server-side  
4. Razorpay order created (if applicable)  
5. Payment verified  
6. Enrollment activated  

Frontend never sends final price — server computes it.

---

## 🎟️ Coupon Engine (Server-Side Only)

Validations implemented:

- Coupon existence
- `is_active` flag
- Expiry check
- Minimum amount validation
- Flat & percentage discount support
- Negative pricing prevention

All enforced inside Supabase Edge Functions.

---

## 🧪 Preview Mode

`preview = true`

- Calculates final price
- Does NOT create Razorpay order

Prevents:
- Gateway log pollution
- Unnecessary API calls
- Order reconciliation issues

---

## 🆓 Free Plan Protection

Free plan abuse prevented using:

```
UNIQUE (user_email, plan_code)
```

Server checks if user already used FREE plan before enrollment.

Prevents replay & multi-trial abuse.

---

## 🗄️ Database Design

### plans
- id (uuid, primary key)
- code (unique)
- price
- days
- created_at

### coupons
- id (uuid, primary key)
- code (unique)
- discount_type (flat / percentage)
- discount_value
- min_amount
- expires_at
- is_active
- created_at

### student_enrollments
- id (uuid, primary key)
- user_email
- plan_code
- payment_id
- order_id
- amount_paid
- status (pending / active / expired)
- start_date
- end_date
- created_at

---

## 🔁 Idempotency Strategy

Critical constraint:

```
UNIQUE (user_email, plan_code)
```

Ensures:

- No duplicate enrollments
- Safe refresh handling
- Retry-safe payment logic
- Race-condition protection

Database enforces consistency — not just application logic.

---

## 🔒 Security Decisions

- Razorpay secret stored server-side
- Supabase service role key never exposed
- No client-side price trust
- Coupon logic enforced server-side
- Negative pricing clamped to ≥ 0
- Clear trust boundary definition

---

## ⚙️ Tech Stack

**Frontend**
- HTML
- Tailwind CSS
- JavaScript

**Backend**
- Supabase (PostgreSQL)
- Supabase Edge Functions (Deno runtime)
- Razorpay REST API

**Tools**
- Postman
- Git
- GitHub

---

## 📈 Current Capabilities

- Secure payment-based enrollment
- Coupon-based pricing
- Free plan restrictions
- Enrollment lifecycle management
- Role-based dashboard access
- SEO-optimized public pages

---

## 🔮 Future Enhancements

- Webhook-based payment verification
- Background job queue for activation
- Audit logging
- Rate limiting
- Subscription auto-renewal

---

## 👨‍💻 Author

Jan Mohammad  
Backend-focused Engineer  
GitHub: https://github.com/jansiddiqui
