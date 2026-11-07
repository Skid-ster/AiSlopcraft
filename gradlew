#!/bin/bash
set -e
if [ "$OS" == "Windows_NT" ]
then
    set -o pipefail
    java -jar gradle/wrapper/gradle-wrapper.jar "$@"
else
    ./gradlew "$@"
fi
