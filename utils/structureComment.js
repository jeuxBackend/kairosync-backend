export const structureComments = (comments) => {
  const commentMap = new Map();
  const rootComments = [];

  comments.forEach(comment => {
    const commentData = {
      ...comment.toJSON(),
      replies: []
    };
    commentMap.set(comment.id, commentData);
  });

  comments.forEach(comment => {
    const commentData = commentMap.get(comment.id);
    
    if (comment.parentCommentId) {
      const parentComment = commentMap.get(comment.parentCommentId);
      if (parentComment) {
        parentComment.replies.push(commentData);
      }
    } else {
      rootComments.push(commentData);
    }
  });

  return rootComments;
};