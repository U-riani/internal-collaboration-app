export const MESSAGE_GROUP_WINDOW_MS = 5 * 60 * 1000;

export function canGroupMessages(previous, current, unreadStartMessageId = null) {
  if (!previous || !current || previous.senderId !== current.senderId) return false;
  if (current.id === unreadStartMessageId) return false;

  const previousTime = new Date(previous.createdAt);
  const currentTime = new Date(current.createdAt);
  const elapsed = currentTime.getTime() - previousTime.getTime();

  return (
    Number.isFinite(elapsed) &&
    elapsed >= 0 &&
    elapsed <= MESSAGE_GROUP_WINDOW_MS &&
    previousTime.toDateString() === currentTime.toDateString()
  );
}

export function getMessageGroupPosition(messages, index, unreadStartMessageId = null) {
  const message = messages[index];
  return {
    startsGroup: !canGroupMessages(messages[index - 1], message, unreadStartMessageId),
    endsGroup: !canGroupMessages(message, messages[index + 1], unreadStartMessageId),
  };
}
