<script lang="ts">
import type { Account } from './models';

export type ScriptAccount = Account;
</script>

<script setup lang="ts">
import type { Account, EmitPayload } from './models';

const props = defineProps<{
  profile: Account;
}>();

const emit = defineEmits<(event: 'save', payload: EmitPayload) => void>();

type SetupProfile = typeof props.profile;
type SavePayload = Parameters<typeof emit>[1];
</script>

<template>
  <section>{{ props.profile.id }}</section>
</template>
