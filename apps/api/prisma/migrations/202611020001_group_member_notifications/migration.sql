-- Group membership is its own notification event, separate from a new message.
ALTER TYPE "NotificationType" ADD VALUE 'GROUP_MEMBER_ADDED';
