// A response started under an earlier identity must not repopulate cleared caches.
let revision = 0;
export const customerRevision = () => revision;
export const invalidateCustomerRevision = () => {
  revision += 1;
};
