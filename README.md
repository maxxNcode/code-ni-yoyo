# Code-Ni-Yoyo

A simple and secure code sharing platform for developers who want to share their code snippets and projects with others.

## Features

- **Share Code Publicly** - Upload and share your code with the community
- **Password Protection** - Every project you create is protected by a password
- **Secure Deletion** - Only the creator (with the password) can delete their files
- **Admin Panel** - Built-in admin authentication for managing content
- **Database Storage** - Uses Turso (libSQL) for reliable data persistence

## Getting Started

### Prerequisites

- Node.js installed
- Turso database credentials (optional, for persistent storage)

### Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   TURSO_DB_URL=your_turso_database_url
   TURSO_DB_AUTH_TOKEN=your_turso_auth_token
   ADMIN_PASSWORD=your_admin_password
   ```

4. Start the server:
   ```bash
   npm start
   ```

5. Open your browser and navigate to `http://localhost:3000`

## How to Use

1. **Create a Project** - Upload your code files and set a password
2. **Share** - Share your project URL with others
3. **Manage** - Use your password to delete or modify your projects when needed

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: Turso (libSQL)
- **Frontend**: HTML, CSS, JavaScript

## License

This project is open source and available for personal and educational use.
