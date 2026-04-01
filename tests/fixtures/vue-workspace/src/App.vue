<script setup lang="ts">
interface Props {
  user: {
    profile: {
      id: string;
      roles: string[];
    };
  };
  flags: Record<string, boolean>;
}

const props = defineProps<Props>();
const selectRole = (role: string) => role;

type UserProfile = typeof props.user.profile;
</script>

<template>
  <section :data-user-id="user.profile.id">{{ props.user.profile.id }}</section>
  <button
    v-for="(role, index) in user.profile.roles"
    :key="index"
    :data-role="role"
    @click="selectRole(role)"
  >
    {{ role.toUpperCase() }}
  </button>

  <SlotProvider>
    <template #default="{ item }">
      <span>{{ item.id }}</span>
    </template>
  </SlotProvider>
</template>
