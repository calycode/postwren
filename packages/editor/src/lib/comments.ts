export type BlockCommentStatus = 'open' | 'done';

/** A note attached to one block. The host owns persistence. */
export type BlockComment = {
   id: string;
   blockId: string;
   body: string;
   status: BlockCommentStatus;
   createdAt: number;
   updatedAt: number;
};
