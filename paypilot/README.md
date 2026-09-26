# PayPilot

A modern payment control center with Google Login, email/password authentication, Razorpay Checkout, transaction history, and a modular idea lab for future payment features.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: PostgreSQL + Prisma
- Authentication: Google OAuth + JWT HTTP-only cookie + email/password
- Payments: Razorpay
- Deployment: Render

## Project structure

```text
paypilot/
  frontend/
  backend/
  render.yaml
  .env.example
```

## 1. Local setup

### Backend

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Copy `.env.example` to `backend/.env` and set the required values.

## Google Login

Create a Google OAuth Web application in Google Cloud Console. Add the backend callback URL:

```text
http://localhost:5000/api/auth/google/callback
```

For production, use:

```text
https://YOUR-BACKEND.onrender.com/api/auth/google/callback
```

The application only requests the basic `openid`, `profile`, and `email` identity scopes. Google recommends using OAuth libraries for server-side web applications. See the official Google documentation linked below.

## Razorpay

Use Razorpay Test Mode first.

Required backend variables:

```env
RAZORPAY_KEY_ID=your_test_key_id
RAZORPAY_KEY_SECRET=your_test_key_secret
```

The backend creates the Razorpay order and verifies the Razorpay signature before recording a successful payment.

## Render

The included `render.yaml` defines the API web service and PostgreSQL database. Connect the repository to Render and add the secret environment variables in the Render dashboard.

The frontend can be deployed as a static site on Render or another static hosting provider. Set:

```env
VITE_API_URL=https://YOUR-BACKEND.onrender.com/api
VITE_RAZORPAY_KEY_ID=your_test_key_id
```

### Important

Never commit `.env`, Google client secrets, or Razorpay secret keys.

## Official docs

- Google OAuth: https://developers.google.com/identity/protocols/oauth2/web-server
- Razorpay Standard Checkout: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/
- Render Node deployment: https://render.com/docs/deploy-node-express-app
