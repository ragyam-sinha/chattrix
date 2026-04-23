const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O,0,I,1

function randomSegment(len) {
  return Array.from({ length: len }, () =>
    CHARS[Math.floor(Math.random() * CHARS.length)]
  ).join('');
}

export default async function generateChatrixId(UserModel) {
  for (let attempts = 0; attempts < 10; attempts++) {
    const id = `CX-${randomSegment(4)}-${randomSegment(4)}`;
    const exists = await UserModel.exists({ chatrixId: id });
    if (!exists) return id;
  }
  throw new Error('Failed to generate unique Chatrix ID after 10 attempts');
}
