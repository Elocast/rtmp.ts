#!/bin/sh
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep "\(.ts$\)\|\(.js$\)")

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

echo "\nType Checking:"
TSC_PATH="."
TSC_BIN="$TSC_PATH/node_modules/typescript/bin/tsc"

$TSC_BIN --project $TSC_PATH/tsconfig.json

if [ $? -ne 0 ]; then
  echo "\t\033[41mCOMMIT FAILED:\033[0m Type checks didn't pass."
  exit 1
fi

echo "Type Checks Cmpleted!\n"

echo "\nLinting Started:"

# Build ESLint paths
ESL_PATH="."
ESL="node $ESL_PATH/node_modules/eslint/bin/eslint.js --config $ESL_PATH/.eslintrc.json  --resolve-plugins-relative-to $ESL_PATH"
$ESL &> /dev/null

# Check for ESLint
if [ $? -eq 1 ]; then
  echo "\t\033[41mPlease install ESlint\033[0m"
  exit 1
fi

# Lint the files
for FILE in $STAGED_FILES
do
  $ESL --fix --fix-type suggestion,layout,problem "$FILE"

  if [ $? -eq 0 ]; then
    git add "$FILE"
    echo "\033[32mESLint Passed: $FILE\033[0m"
  else
    echo "\033[41mESLint Failed: $FILE\033[0m"
    exit 1
  fi
done
echo "Linting completed!\n"
