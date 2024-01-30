# Subscribe Button Frame with XMTP Consent

This guide will walk you through creating a frame, opt-in message, and a subscribe button using XMTP for consent confirmation.

<details>
<summary><h3>Prerequisites</h3></summary>

This guide will provide you with the initial steps necessary to for setting up your environment.

#### Environment Variables

Environment variables are used to store sensitive data like API keys, private keys, and URLs. In this project, we use a .env file to store these variables. Here's what each variable in the .env file represents:

- `NEYNAR_API_KEY`: This is your API key for the Neynar service.
- `XMTP_PRIVATE_KEY`: This is your private key for the XMTP service.
- `NEXT_PUBLIC_XMTP_ENV`: This is the environment for the XMTP service. It can be either 'production' or 'development'.
- `NEXT_PUBLIC_NGROK_URL`: This is the public URL generated by Ngrok that forwards actions to your localhost.
- `NEXT_PUBLIC_PROD_URL`: This is the production URL for your application.

```bash
NEYNAR_API_KEY=neynar_api_key
XMTP_PRIVATE_KEY=your_key
NEXT_PUBLIC_XMTP_ENV=production
NEXT_PUBLIC_NGROK_URL=ngrok_url //used only for development
NEXT_PUBLIC_PROD_URL=your_url //the frame official url
```

Remember to replace the values with your actual keys and URLs. Never share your `.env` file or its contents as it contains sensitive information.

#### Debugging in local with Ngrok

To set up a localhost url that you can test with the [Frames Embeds Tool](https://warpcast.com/~/developers/embeds) you can use the service Ngrok. This will generate a public URL that forwards actions to your localhost.

1. [Sign up](ngrok.com) to Ngrok.

2. Example on macOS:

```jsx
brew install ngrok/ngrok/ngrok
ngrok authtoken <your_auth_token>
ngrok http 3000
```

#### Libraries & APIs

This project uses several libraries that are specified in the `package.json` file. Here's a brief description of each:

- `@xmtp/xmtp-js`: This is the XMTP SDK, used for interacting with the XMTP network.
- `Neynar API`: Used for retrieving the users' data associated with a Farcaster ID.
- `@coinbase/onchainkit`: This library is used for interacting with the OnChainKit API.
- `ethers`: This is a library for interacting with the Ethereum blockchain.
- `xmtp-js-server`: This is a previous version of the XMTP JS SDK that is compatible with server-side operations.

</details>

---

### Step 1: Create the Frame Metadata

A Farcaster [Frame](https://warpcast.notion.site/Farcaster-Frames-4bd47fe97dc74a42a48d3a234636d8c5) lets you turn any cast into an interactive app. A Frame is created with simple OpenGraph tags. In this example we are setting up the metadata using [Coinbase OnChainKit](https://github.com/coinbase/onchainkit).

```jsx
import { getFrameMetadata } from '@coinbase/onchainkit';
import type { Metadata } from 'next';

const frameMetadata = getFrameMetadata({
  buttons: ['Subscribe via XMTP'],
  image: process.env.NEXT_PUBLIC_PROD_URL + '/banner.jpeg',
  post_url: process.env.NEXT_PUBLIC_PROD_URL + '/api/frame',
});
export const metadata: Metadata = {
  title: 'XMTP.org',
  description: 'LFG',
  openGraph: {
    title: 'XMTP.org',
    description: 'LFG',
    images: [process.env.NEXT_PUBLIC_PROD_URL+'/banner.jpeg'],
  },
  other: {
    ...frameMetadata,
  },
};

export default function Page() {
  return (
    <>
      <h1>XMTP Subscribe Button</h1>
    </>
  );
}
```

This will render the XMTP frame with the Subscribe button

![](/public/print1.png)

### Step 2: Create an API endpoint

To set up an API route in Next.js for handling XMTP subscription requests, you'll need to create a new file in the `pages/api` directory. This file will contain the logic for your API endpoint. For example, to create an API route at `/api/frame`with a file named `route.ts` inside a folder.

Note: To utilize this function, we rely on Neynar APIs. In order to avoid rate limiting, please ensure that you have your own API KEY. Sign up [here](https://neynar.com).

```jsx
// Example of the getResponse function, ensure it's defined or imported
async function getResponse(req: NextRequest): Promise<NextResponse> {
  // Your existing logic for handling the request
  // This is where you would interact with XMTP, parse the request, etc.
  return new NextResponse('Frame Buttons');
}

export async function POST(req: NextRequest): Promise<Response> {
  return getResponse(req);
}
```

### Step 3: Extracting account address and button index

When a user clicks a button in a frame, Warpcast sends a POST request containing both trusted and untrusted data. For simplicity and security, we'll focus on using the untrusted data, which includes the user's `Farcaster ID` and the `button index`. Here's how you can modify your `getResponse` function to extract the account address and button index from the received data,

This is an example payload after the user clicks the button:

```jsx
Frame Request: {
  untrustedData: {
    fid: 10952,
    buttonIndex: 1,
    castId: { fid: 10952, hash: '0x0000000000000000000000000000000000000001' }
  }
}
```

```jsx
const body: { untrustedData?: { fid?: number, buttonIndex?: number } } = await req.json();
const fid = body.untrustedData?.fid;
const buttonIndex = body.untrustedData?.buttonIndex;

// Fetch user data from the Neynar API using the Farcaster ID (fid)
const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
  method: 'GET',
  headers: {
    Accept: 'application/json',
    'api_key': process.env.NEYNAR_API_KEY as string,
  },
});
const data = await response.json();
const user = data.users[0];

// Assuming the account address is the first item in the 'verifications' array
accountAddress = user.verifications[0];
```

#### Managing Frame State

1. Check if the user is already subscribed:

   - If the user is already subscribed in localDB, the button will return "You are already subscribed".
   - If the user is not subscribed, proceed to the next step.

2. Check if the account address is on the XMTP network:

   - If the address is not on the XMTP network, the button will return "Address is not on the XMTP network".
   - If the address is on the XMTP network, proceed to the next step.

3. Subscribe the user and send the first opt-in message:

   - Set the user's account address as 'subscribed' in the Redis database.
   - Start a new conversation with the user's account address using the XMTP client.
   - Send a message to the user with a link for consent confirmation.
   - The button will return "Subscribed! Check your inbox for a confirmation link.

### Step 4: Create the First Opt-In Message

The first opt-in message is sent when a user subscribes. This is handled in the app/api/frame/route.ts file:

```jsx
// Initialize the wallet and client
let wallet = await initializeWallet();
let client = await createXMTPClient(wallet);
// Check if the account address is on the network
let isOnNetwork = await checkAddressIsOnNetwork(client, accountAddress);
if (isOnNetwork === true) {
  // Start a new conversation and send a message
  let conversation = await newConversation(client, accountAddress);
  returnMessage = 'Subscribed! Check your inbox for a confirmation link.';
  sendMessage(
    conversation,
    `You're almost there! If you're viewing this in an inbox with portable consent, simply click the "Accept" button below to complete your subscription and start receiving updates. If the button doesn't appear, please confirm your consent by visiting the following link:\n
    ${apiUrl}/consent\n
    This ensures your privacy and consent are respected. Thank you for joining us!`,
  );
} else returnMessage = 'Address is not on the XMTP network. ';
```

### Step 3: Create the Subscribe Button for Consent Confirmation

The subscribe button, which is created in the `pages/consent.tsx` file, is a fundamental component in the user consent process as outlined in the XMTP documentation on [user consent](https://xmtp.org/docs/build/user-consent). When clicked, this button initiates the consent process, marking the second step in the double opt-in mechanism and ensuring that users explicitly agree to receive communications.

```jsx
// Define the handleClick function
const handleClick = async () => {
  try {
    // Set loading to true
    setLoading(true);
    // Get the subscriber
    let wallet = await connectWallet();
    let client = await Client.create(wallet, { env: process.env.NEXT_PUBLIC_XMTP_ENV });
    console.log(client.address);
    // Refresh the consent list to make sure your application is up-to-date with the
    await client.contacts.refreshConsentList();

    // Get the consent state of the subscriber
    let state = client.contacts.consentState(client.address);

    // If the state is unknown or blocked, allow the subscriber
    if (state === 'unknown' || state === 'denied') {
      state = 'allowed';
      await client.contacts.allow([client.address]);
    } else if (state === 'allowed') {
      state = 'denied';
      await client.contacts.deny([client.address]);
    }

    // Set the subscription label
    setSubscriptionStatus('Consent State: ' + state);

    // Set loading to false
    setLoading(false);
  } catch (error) {
    // Log the error
    console.log(error);
  }
};
```

### Development

To run this frame in localhost run the following. Remember to replace all your `.env` variables.

```bash
yarn install
yarn dev
```

## Resources

For further reading and tools to help with the development and understanding of Frames, the following resources are invaluable:

- **Farcaster Frames**: Official Farcaster Documentation. [Read more](https://www.notion.so/xmtplabs/Frames-are-a-good-idea-9c406517c2ed4da09b2fbf6493695787)
- **Frame Embeds Tool**: Tool for testing frames in development. [Explore](https://warpcast.com/~/developers/embeds)
- **Jesse Pollak Cast**: Community Engagement and resources. [Read here](https://warpcast.com/jessepollak/0x06279b73)
- **Frames Warpcast Channel**: Warpcast updates on Frames. [Visit channel](https://warpcast.com/~/channel/frames)
- **XMTP Warpcast Channel**: XMTP updates. [Visit channel](https://warpcast.com/~/channel/xmtp)
- **Neynar Docs**: Documentation for the Neynar API. [Read the docs](https://docs.neynar.com/reference/user-bulk)
- **How to Think About Frames**: An insightful article. [Read article](https://medium.com/@decktonic/how-to-think-about-frames-07853d93a549)

Special thanks to [Leonardo Zizzamia](https://github.com/Zizzamia) for providing the starter code with [A Frame in 100 Lines](https://github.com/Zizzamia/a-frame-in-100-lines).
