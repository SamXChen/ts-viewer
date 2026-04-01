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

type UserProfile = typeof props.user.profile;
</script>

<template>
  <section>{{ props.user.profile.id }}</section>
</template>