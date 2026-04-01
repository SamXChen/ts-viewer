declare module '*.vue' {
  const component: unknown;
  export default component;
}

declare function defineProps<T>(): T;
declare function defineEmits<T>(): T;
