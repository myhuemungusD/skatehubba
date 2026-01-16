# 🚀 Get Your EAS Project ID

## ✅ All Metadata Cleaned!

I've removed all corrupted EAS metadata:

- ✅ Cleaned `mobile/.eas`
- ✅ Cleaned `mobile/.expo`
- ✅ Cleaned `mobile/.expo-shared`
- ✅ Removed `mobile/eas.json`
- ✅ Cleaned global `~/.expo`
- ✅ Cleaned global `~/.eas`

Your environment is completely fresh!

---

## Next Step: Run This Command

Open your terminal and run:

```bash
cd mobile
eas init
```

### What Will Happen

1. **Login prompt** - It will ask you to log in to Expo

   ```
   ? Log in to your Expo account:
   ```

   Press Enter and follow the browser login flow

2. **Create/Select Organization**

   ```
   ? Choose an account:
   ```

   Select your account or create a new one

3. **Create Project**

   ```
   ? No project found. Create one? (Y/n)
   ```

   Press `Y` and Enter

4. **Project Created! 🎉**
   ```
   ✔ Created project
   Project ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```

---

## Copy the Project ID

After you see "Project ID: ...", **copy the entire ID** (it looks like: `abc123-def456-789-xyz`)

Then paste it back here and I'll:

1. ✅ Update your `app.config.js` with the ID
2. ✅ Validate your Firebase configs
3. ✅ Prepare your build command
4. ✅ Get your APK building!

---

## Troubleshooting

### If `eas: command not found`

```bash
npm install -g eas-cli
```

### If login fails

```bash
eas logout
eas login
```

### If you still see "Invalid UUID"

Run this to completely reset:

```bash
reset
cd mobile
eas init
```

---

## Alternative: I'll Prepare Everything

If you prefer, I can:

1. Create the build command for you
2. You run `eas init` yourself
3. You update the project ID manually
4. You run the build

Just let me know which approach you prefer! 🛹
